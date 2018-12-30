
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */
import { Tx, Input, Output, Outpoint } from 'leap-core';
import { EVMRevert, submitNewPeriodWithTx } from './helpers';

require('./helpers/setup');

const AdminableProxy = artifacts.require('AdminableProxy');
const Bridge = artifacts.require('Bridge');
const ExitHandler = artifacts.require('ExitHandler');
const PriorityQueue = artifacts.require('PriorityQueue');
const SimpleToken = artifacts.require('SimpleToken');
const SpaceDustNFT = artifacts.require('SpaceDustNFT');

const aSecond = async () => new Promise(resolve => setTimeout(resolve, 1000));

const exitUtxoId = (exitEvent) => {
  const { txHash, outIndex } = exitEvent.logs[0].args;
  return new Outpoint(txHash, outIndex.toNumber()).getUtxoId();
};

contract('ExitHandler', (accounts) => {
  const alice = accounts[0];
  // This is from ganache GUI version
  const alicePriv = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';
  const bob = accounts[1];
  const bobPriv = '0x7bc8feb5e1ce2927480de19d8bc1dc6874678c016ae53a2eec6a6e9df717bfac';
  const charlie = accounts[2];

  describe('Test', () => {
    // contracts
    let bridge;
    let exitHandler;
    let proxy;

    // ERC20 token stuff
    let nativeToken;
    const nativeTokenColor = 0;
    let depositTx;
    let transferTx;
    const depositAmount = 100;
    const depositId = 1;

    // ERC721 token stuff
    let nftToken;
    let nftColor;
    let nftTokenId;
    let nftTokenIdStr;
    let nftDepositTx;
    let nftTransferTx;

    const maxReward = 50;
    const parentBlockInterval = 0;
    const exitDuration = 0;
    const exitStake = 0;    

    const seedTxs = async () => {
      await nativeToken.approve(exitHandler.address, 1000);
      await exitHandler.deposit(alice, depositAmount, nativeTokenColor).should.be.fulfilled;

      depositTx = Tx.deposit(depositId, depositAmount, alice);
      transferTx = Tx.transfer(
        [new Input(new Outpoint(depositTx.hash(), 0))],
        [new Output(50, bob), new Output(50, alice)]
      ).sign([alicePriv]);
    };

    const seedNftTxs = async () => {
      nftToken = await SpaceDustNFT.new();
      
      let receipt = await nftToken.mint(alice, 10, true, 2);
      
      nftTokenId = receipt.logs[0].args.tokenId;
      nftTokenIdStr = nftTokenId.toString(10);

      const data = await exitHandler.contract.registerToken.getData(nftToken.address, true);
      receipt = await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;
      nftColor = Buffer.from(receipt.receipt.logs[0].data.replace('0x', ''), 'hex').readUInt32BE(28);
      
      // deposit
      await nftToken.approve(exitHandler.address, nftTokenId);
      receipt = await exitHandler.deposit(alice, nftTokenId, nftColor, { from: alice }).should.be.fulfilled;        
      const nftDepositId = receipt.logs[0].args.depositId.toNumber();

      nftDepositTx = Tx.deposit(nftDepositId, nftTokenIdStr, alice, nftColor);
      // transfer to bob
      nftTransferTx = Tx.transfer(
        [new Input(new Outpoint(nftDepositTx.hash(), 0))],
        [new Output(nftTokenIdStr, bob, nftColor)]
      ).sign([alicePriv]);
    }

    const submitNewPeriod = txs => submitNewPeriodWithTx(txs, bridge, { from: bob });

    beforeEach(async () => {
      const pqLib = await PriorityQueue.new();
      ExitHandler.link('PriorityQueue', pqLib.address);
      nativeToken = await SimpleToken.new();
      const bridgeCont = await Bridge.new();
      let data = await bridgeCont.contract.initialize.getData(parentBlockInterval, maxReward);
      proxy = await AdminableProxy.new(bridgeCont.address, data, {from: accounts[2]});
      bridge = Bridge.at(proxy.address);
      data = await bridge.contract.setOperator.getData(bob);
      await proxy.applyProposal(data, {from: accounts[2]});

      const vaultCont = await ExitHandler.new();
      data = await vaultCont.contract.initializeWithExit.getData(bridge.address, exitDuration, exitStake);
      proxy = await AdminableProxy.new(vaultCont.address, data, {from: accounts[2]});
      exitHandler = ExitHandler.at(proxy.address);

      // register first token
      data = await exitHandler.contract.registerToken.getData(nativeToken.address, false);
      await proxy.applyProposal(data, {from: accounts[2]});
      // At this point alice is the owner of bridge and depositHandler and has 10000 tokens
      // Bob is the bridge operator and exitHandler and has 0 tokens
      // Note: all txs in these tests originate from alice unless otherwise specified

      await seedTxs();
      await seedNftTxs();
    });

    describe('Start exit', async () => {
      it('Should allow to exit valid utxo', async () => {
        const period = await submitNewPeriod([depositTx, transferTx]);

        const transferProof = period.proof(transferTx);
        const outputIndex = 1;
        const inputProof = period.proof(depositTx); // transferTx spends depositTx
        const inputIndex = 0;
        await exitHandler.startExit(inputProof, transferProof, outputIndex, inputIndex);

        const aliceBalanceBefore = await nativeToken.balanceOf(alice);

        await exitHandler.finalizeTopExit(nativeTokenColor);

        const aliceBalanceAfter = await nativeToken.balanceOf(alice);

        aliceBalanceBefore.plus(50).should.be.bignumber.equal(aliceBalanceAfter);

      });

      it('Should allow to exit deposit utxo', async () => {
        const period = await submitNewPeriod([depositTx]);

        const proof = period.proof(depositTx);
        const outputIndex = 0;
        const inputIndex = 0;
        await exitHandler.startExit([], proof, outputIndex, inputIndex);

        const aliceBalanceBefore = await nativeToken.balanceOf(alice);

        await exitHandler.finalizeTopExit(nativeTokenColor);

        const aliceBalanceAfter = await nativeToken.balanceOf(alice);

        aliceBalanceBefore.plus(depositAmount).should.be.bignumber.equal(aliceBalanceAfter);

      });

      it('Should allow to exit deposit', async () => {
        await exitHandler.startDepositExit(1);

        const aliceBalanceBefore = await nativeToken.balanceOf(alice);

        await exitHandler.finalizeTopExit(nativeTokenColor);

        const aliceBalanceAfter = await nativeToken.balanceOf(alice);

        aliceBalanceBefore.plus(depositAmount).should.be.bignumber.equal(aliceBalanceAfter);
      });


      it('Should allow to challenge exiting deposit', async () => {
        await exitHandler.startDepositExit(1);

        const period = await submitNewPeriod([depositTx]);
        const one = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const proof = period.proof(depositTx);

        // challenge exit and make sure exit is removed
        let exit = await exitHandler.exits(one);
        assert.equal(exit[2], alice);
        
        await exitHandler.challengeExit([], proof, 0, 0);        
        exit = await exitHandler.exits(one);
        // check that exit was deleted
        assert.equal(exit[2], '0x0000000000000000000000000000000000000000');
      });

      it('Should allow to exit NFT utxo', async () => {
        const period = await submitNewPeriod([nftDepositTx, nftTransferTx]);

        const proof = period.proof(nftTransferTx);
        const inputProof = period.proof(nftDepositTx);

        // withdraw output
        assert.equal(await nftToken.ownerOf(nftTokenId), exitHandler.address);
        const event = await exitHandler.startExit(inputProof, proof, 0, 0, { from: bob });

        await exitHandler.finalizeTopExit(nftColor);

        assert.equal(await nftToken.ownerOf(nftTokenId), bob);
        // exit was markeed as finalized
        assert.equal((await exitHandler.exits(exitUtxoId(event)))[3], true);
      });

      it('Should allow to exit only for utxo owner', async () => {
        const period = await submitNewPeriod([depositTx, transferTx]);

        const transferProof = period.proof(transferTx);
        const outputIndex = 1;
        const inputProof = period.proof(depositTx);

        await exitHandler.startExit(inputProof, transferProof, outputIndex, 0, { from: bob }).should.be.rejectedWith(EVMRevert);
      });

      it('Should allow to challenge exit', async () => {
        // utxo that will have spend exit utxo
        const spendTx = Tx.transfer(
          [new Input(new Outpoint(transferTx.hash(), 0))],
          [new Output(50, charlie)]
        ).sign([bobPriv]);

        const period = await submitNewPeriod([ depositTx, transferTx, spendTx]);

        const transferProof = period.proof(transferTx);
        const spendProof = period.proof(spendTx);
        const inputProof = period.proof(depositTx);

        // withdraw output
        const event = await exitHandler.startExit(inputProof, transferProof, 0, 0, { from: bob });
        
        const utxoId = exitUtxoId(event);
        assert.equal(utxoId, spendTx.inputs[0].prevout.getUtxoId());

        // challenge exit and make sure exit is removed
        assert.equal((await exitHandler.exits(utxoId))[2], bob);
        
        await exitHandler.challengeExit(spendProof, transferProof, 0, 0);
        
        assert.equal((await exitHandler.exits(utxoId))[2], '0x0000000000000000000000000000000000000000');
        assert.equal((await exitHandler.tokens(0))[1], 1);
        
        const bal1 = await nativeToken.balanceOf(bob);

        await exitHandler.finalizeTopExit(0);
        
        const bal2 = await nativeToken.balanceOf(bob);
        // check transfer didn't happen
        assert.equal(bal1.toNumber(), bal2.toNumber());
        // check exit was evicted from PriorityQueue
        assert.equal((await exitHandler.tokens(0))[1], 0);
        
      });

      it('Should allow to challenge youngest input for exit', async () => {
        // period1: depositTx, anotherDepositTx
        // period2: tranferTx spending depositTx (priority 1)
        // period3: spendTx spending transferTx (priority 2) and anotherDepositTx (priority 1). Thus spendTx has priority 2 (youngest)
        const anotherDepositTx = Tx.deposit(depositId + 1, 50, bob);

        const spendTx = Tx.transfer(
          [
            new Input(new Outpoint(transferTx.hash(), 0)),        // from period2 thus youngest
            new Input(new Outpoint(anotherDepositTx.hash(), 0)),  // from period1
          ],
          [new Output(100, alice)]
        ).sign([bobPriv, bobPriv]);    
        
        const period1 = await submitNewPeriod([depositTx, anotherDepositTx]);
        await aSecond();
        const period2 = await submitNewPeriod([transferTx]);
        await aSecond();
        const period3 = await submitNewPeriod([spendTx]);

        const spendProof = period3.proof(spendTx);
        const notReallyYoungestInputProof = period1.proof(anotherDepositTx);
        const notReallyYoungestInputId = 1;
        const youngestInputProof = period2.proof(transferTx);
        const youngestInputId = 0;

        // start exit with older input (priority 1)
        const exitingOutput = 0;
        const event = await exitHandler.startExit(
          notReallyYoungestInputProof, spendProof, exitingOutput, notReallyYoungestInputId,
          { from: alice },
        );

        const utxoId = exitUtxoId(event);
        
        assert.equal(utxoId, new Outpoint(spendTx.hash(), exitingOutput).getUtxoId());

        let exit = await exitHandler.exits(utxoId);
        assert.equal(exit[2], alice);

        // challenge exit with youngest input
        await exitHandler.challengeYoungestInput(youngestInputProof, spendProof, exitingOutput, youngestInputId);

        exit = await exitHandler.exits(utxoId);
        assert.equal((await exitHandler.tokens(0))[1], 1);
        const bal1 = await nativeToken.balanceOf(alice);

        await exitHandler.finalizeTopExit(0);
        
        const bal2 = await nativeToken.balanceOf(alice);
        // check transfer didn't happen
        assert.equal(bal1.toNumber(), bal2.toNumber());
        // check exit was evicted from PriorityQueue
        assert.equal((await exitHandler.tokens(0))[1], 0);
        assert.equal(exit[2], '0x0000000000000000000000000000000000000000');
      });

      it('Should allow to challenge NFT exit', async () => {
        // utxo that will have spend exit utxo
        let spend = Tx.transfer(
          [new Input(new Outpoint(nftTransferTx.hash(), 0))],
          [new Output(nftTokenIdStr, charlie, nftColor)]
        );
        spend = spend.sign([bobPriv]);

        const period = await submitNewPeriod([nftDepositTx, nftTransferTx, spend]);

        const transferProof = period.proof(nftTransferTx);
        const spendProof = period.proof(spend);
        const inputProof = period.proof(nftDepositTx);
        
        // withdraw output
        const event = await exitHandler.startExit(inputProof, transferProof, 0, 0, { from: bob });
        const utxoId = exitUtxoId(event);

        assert.equal(utxoId, spend.inputs[0].prevout.getUtxoId());
        // challenge exit and make sure exit is removed
        let exit = await exitHandler.exits(utxoId);
        assert.equal(exit[2], bob);
        
        await exitHandler.challengeExit(spendProof, transferProof, 0, 0);        
        exit = await exitHandler.exits(utxoId);
        // check that exit was deleted
        assert.equal(exit[2], '0x0000000000000000000000000000000000000000');
      });

    });

  });

});