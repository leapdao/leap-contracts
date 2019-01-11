
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import { Tx, Input, Output, Outpoint, Exit } from 'leap-core';

import { submitNewPeriodWithTx } from './helpers';

require('./helpers/setup');

const AdminableProxy = artifacts.require('AdminableProxy');
const Bridge = artifacts.require('Bridge');
const FastExitHandler = artifacts.require('FastExitHandler');
const PriorityQueue = artifacts.require('PriorityQueue');
const NativeToken = artifacts.require('NativeToken');

contract('FastExitHandler', (accounts) => {
  const alice = accounts[0];
  // This is from ganache GUI version
  const alicePriv = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';
  const bob = accounts[1];
  const supply = new web3.BigNumber(10).pow(18).mul(10000); // 10k

  describe('Test', () => {
    // contracts
    let bridge;
    let exitHandler;
    let proxy;

    // ERC20 token stuff
    let nativeToken;
    const nativeTokenColor = 0;
    const depositAmount = 100;

    const parentBlockInterval = 0;
    const exitDuration = 0;
    const exitStake = 0;    

    const seedTxs = async () => {
      await nativeToken.approve(exitHandler.address, 1000);
      await exitHandler.deposit(alice, depositAmount, nativeTokenColor).should.be.fulfilled;
    };

    const submitNewPeriod = txs => submitNewPeriodWithTx(txs, bridge, { from: bob });

    beforeEach(async () => {
      const pqLib = await PriorityQueue.new();
      FastExitHandler.link('PriorityQueue', pqLib.address);
      nativeToken = await NativeToken.new('0x53696d706c6520546f6b656e', '0x534d54', 18);
      await nativeToken.mint(accounts[0], supply);
      const bridgeCont = await Bridge.new();
      let data = await bridgeCont.contract.initialize.getData(parentBlockInterval);
      proxy = await AdminableProxy.new(bridgeCont.address, data, {from: accounts[2]});
      bridge = Bridge.at(proxy.address);
      data = await bridge.contract.setOperator.getData(bob);
      await proxy.applyProposal(data, {from: accounts[2]});

      const vaultCont = await FastExitHandler.new();
      data = await vaultCont.contract.initializeWithExit.getData(bridge.address, exitDuration, exitStake);
      proxy = await AdminableProxy.new(vaultCont.address, data, {from: accounts[2]});
      exitHandler = FastExitHandler.at(proxy.address);

      // register first token
      data = await exitHandler.contract.registerToken.getData(nativeToken.address, false);
      await proxy.applyProposal(data, {from: accounts[2]});
      // At this point alice is the owner of bridge and depositHandler and has 10000 tokens
      // Bob is the bridge operator and exitHandler and has 0 tokens
      // Note: all txs in these tests originate from alice unless otherwise specified

      await seedTxs();
    });

    it('Can fast exit', async () => {

      // give bob some tokens so he can buy the exit
      await nativeToken.transfer(bob, 100);
      await nativeToken.approve(exitHandler.address, 100, {from: bob});

      // alice sends the tokens she want to exit to fastExitHandler and produces proof
      const deposit = Tx.deposit(0, depositAmount, alice);
      let transfer = Tx.transfer(
        [new Input(new Outpoint(deposit.hash(), 0))],
        [new Output(50, exitHandler.address), new Output(50, alice)]
      );
      transfer = transfer.sign([alicePriv]);

      const period = await submitNewPeriod([deposit, transfer]);

      const transferProof = period.proof(transfer);
      const depositProof = period.proof(deposit);

      // she then signes over the utxo and some number, basically saying 
      // "I agree to sell these tokens for x to whoever submits the exit"
      const sellPrice = 40;
      const utxoId = (new Outpoint(transfer.hash(), 0)).getUtxoId();
      const signedData = Exit.signOverExit(utxoId, sellPrice, alicePriv);
      const signedDataBytes32 = Exit.bufferToBytes32Array(signedData);

      const aliceBalance1 = await nativeToken.balanceOf(alice);
      const bobBalance1 = await nativeToken.balanceOf(bob);

      // bob then recieves the signed data. He has to check the exit is valid and can
      // then submit the signed exit to the biridge, paying the agreed price to alice
      // and recieveing the exit
      
      const outputIndex = 0;
      const inputIndex = 0;

      await exitHandler.startBoughtExit(depositProof, transferProof, outputIndex, 
        inputIndex, signedDataBytes32, {from: bob}).should.be.fulfilled;

      const aliceBalance2 = await nativeToken.balanceOf(alice);
      const bobBalance2 = await nativeToken.balanceOf(bob);
      const exitOwner = (await exitHandler.exits(utxoId))[2];
      aliceBalance1.plus(40).should.be.bignumber.equal(aliceBalance2);
      bobBalance1.minus(40).should.be.bignumber.equal(bobBalance2);
      exitOwner.should.be.equal(bob);

      await exitHandler.finalizeTopExit(0);

      const bobBalance3 = await nativeToken.balanceOf(bob);
      bobBalance2.plus(50).should.be.bignumber.equal(bobBalance3);
    });
  });

});