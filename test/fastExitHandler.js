
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */
process.env.NODE_ENV = 'test';

import EVMRevert from './helpers/EVMRevert';
import chai from 'chai';
import chaiBigNumber from 'chai-bignumber';
import chaiAsPromised from 'chai-as-promised';

import { Period, Block, Tx, Input, Output, Outpoint, Exit } from 'leap-core';
import { encodeCall } from 'zos-lib';
import { TestHelper } from 'zos';

const Bridge = artifacts.require('Bridge');
const FastExitHandler = artifacts.require('FastExitHandler');
const PriorityQueue = artifacts.require('PriorityQueue');
const MintableToken = artifacts.require('MockMintableToken');

const should = chai
  .use(chaiAsPromised)
  .use(chaiBigNumber(web3.BigNumber))
  .should();

const sendTransaction = (target, method, args, values, opts) => {
  const data = encodeCall(method, args, values);
  return target.sendTransaction(Object.assign({ data }, opts));
};

contract('FastExitHandler', (accounts) => {
  const alice = accounts[0];
  // This is from ganache GUI version
  const alicePriv = '0xe10d5404bb976d8a5c419b8b1174c4555e5fe803e4bfb06deca2230eed8d6537';
  const bob = accounts[1];
  const bobPriv = '0x9001350c0cb71e7453dfd24d5f60f86fefcab8120c58bf984a6a9210c0064830';
  const charlie = accounts[2];
  const proxyAdmin = accounts[9];

  describe('Test', function() {
    let bridge;
    let fastExitHandler;
    let nativeToken;
    const maxReward = 50;
    const parentBlockInterval = 0;
    const exitDuration = 0;
    const exitStake = 0;

    beforeEach(async () => {
      const pqLib = await PriorityQueue.new();
      FastExitHandler.link('PriorityQueue', pqLib.address);
      this.project = await TestHelper({from: proxyAdmin});
      nativeToken = await this.project.createProxy(MintableToken);
      await sendTransaction(nativeToken, 'initialize'); 
      
      bridge = await this.project.createProxy(Bridge);
      await sendTransaction(bridge, 
        'initialize', 
        ['uint256','uint256','address', 'address'],
        [parentBlockInterval, maxReward, nativeToken.address, alice]);
      
      fastExitHandler = await this.project.createProxy(FastExitHandler);
      await sendTransaction(fastExitHandler, 
        'initialize', 
        ['address', 'uint256', 'uint256', 'address'],
        [bridge.address, exitDuration, exitStake, alice]);

      await bridge.setOperator(bob);
      // At this point alice is the owner of bridge and fastExitHandler and has 10000 tokens
      // Bob is the bridge operator and has 0 tokens
      // Note: all txs in these tests originate from alice unless otherwise specified
    });

    it('Can fast exit', async () => {
      const depositAmount = 100;
      const nativeTokenColor = 0;

      await nativeToken.approve(fastExitHandler.address, 1000);
      await fastExitHandler.deposit(alice, depositAmount, nativeTokenColor).should.be.fulfilled;

      // give bob some tokens so he can buy the exit
      await nativeToken.transfer(bob, 100);
      await nativeToken.approve(fastExitHandler.address, 100, {from: bob});

      // alice sends the tokens she want to exit to fastExitHandler and produces proof
      const deposit = Tx.deposit(0, depositAmount, alice);
      let transfer = Tx.transfer(
        [new Input(new Outpoint(deposit.hash(), 0))],
        [new Output(50, fastExitHandler.address), new Output(50, alice)]
      );
      transfer = transfer.sign([alicePriv]);

      const p = [];
      p[0] = await bridge.tipHash();
      let block = new Block(33).addTx(deposit).addTx(transfer);
      let period = new Period(p[0], [block]);
      p[1] = period.merkleRoot();

      await bridge.submitPeriod(p[0], p[1], {from: bob}).should.be.fulfilled;

      const transferProof = period.proof(transfer);

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
      await fastExitHandler.startBoughtExit(transferProof, outputIndex, signedDataBytes32, {from: bob}).should.be.fulfilled;

      const aliceBalance2 = await nativeToken.balanceOf(alice);
      const bobBalance2 = await nativeToken.balanceOf(bob);
      const exitOwner = (await fastExitHandler.exits(utxoId))[2];
      aliceBalance1.plus(40).should.be.bignumber.equal(aliceBalance2);
      bobBalance1.minus(40).should.be.bignumber.equal(bobBalance2);
      exitOwner.should.be.equal(bob);

      await fastExitHandler.finalizeTopExit(0);

      const bobBalance3 = await nativeToken.balanceOf(bob);
      bobBalance2.plus(50).should.be.bignumber.equal(bobBalance3);
    });
  });

});