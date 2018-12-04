
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

import { Period, Block, Tx, Input, Output, Outpoint } from 'leap-core';
import { encodeCall } from 'zos-lib';
import { TestHelper } from 'zos';

const Bridge = artifacts.require('Bridge');
const ExitHandler = artifacts.require('ExitHandler');
const PriorityQueue = artifacts.require('PriorityQueue');
const MintableToken = artifacts.require('MockMintableToken');
const SpaceDustNFT = artifacts.require('SpaceDustNFT');

const should = chai
  .use(chaiAsPromised)
  .use(chaiBigNumber(web3.BigNumber))
  .should();

const sendTransaction = (target, method, args, values, opts) => {
  const data = encodeCall(method, args, values);
  return target.sendTransaction(Object.assign({ data }, opts));
}; 

contract('ExitHandler', (accounts) => {
  const alice = accounts[0];
  // This is from ganache GUI version
  const alicePriv = '0xe10d5404bb976d8a5c419b8b1174c4555e5fe803e4bfb06deca2230eed8d6537';
  const bob = accounts[1];
  const bobPriv = '0x9001350c0cb71e7453dfd24d5f60f86fefcab8120c58bf984a6a9210c0064830';
  const charlie = accounts[2];
  const proxyAdmin = accounts[9];

  describe('Test', function() {
    let bridge;
    let exitHandler;
    let nativeToken;
    const maxReward = 50;
    const parentBlockInterval = 0;
    const exitDuration = 0;
    const exitStake = 0;

    beforeEach(async () => {
      const pqLib = await PriorityQueue.new();
      ExitHandler.link('PriorityQueue', pqLib.address);
      this.project = await TestHelper({from: proxyAdmin});
      nativeToken = await this.project.createProxy(MintableToken);
      await sendTransaction(nativeToken, 'initialize'); 
      
      bridge = await this.project.createProxy(Bridge);
      await sendTransaction(bridge, 
        'initialize', 
        ['uint256','uint256','address', 'address'],
        [parentBlockInterval, maxReward, nativeToken.address, alice]);

      exitHandler = await this.project.createProxy(ExitHandler);
      await sendTransaction(exitHandler, 
        'initialize', 
        ['address', 'uint256', 'uint256', 'address'],
        [bridge.address, exitDuration, exitStake, alice]);
      
      await bridge.setOperator(bob);
      // At this point alice is the owner of bridge and depositHandler and has 10000 tokens
      // Bob is the bridge operator and exitHandler and has 0 tokens
      // Note: all txs in these tests originate from alice unless otherwise specified
    });

    describe('Start exit', async () => {
      it('Should allow to exit valid utxo', async () => {
        const depositAmount = 100;
        const nativeTokenColor = 0;

        await nativeToken.approve(exitHandler.address, 1000);
        await exitHandler.deposit(alice, depositAmount, nativeTokenColor).should.be.fulfilled;

        const deposit = Tx.deposit(0, depositAmount, alice);
        let transfer = Tx.transfer(
          [new Input(new Outpoint(deposit.hash(), 0))],
          [new Output(50, bob), new Output(50, alice)]
        );
        transfer = transfer.sign([alicePriv]);

        const p = [];
        p[0] = await bridge.tipHash();
        let block = new Block(33).addTx(deposit).addTx(transfer);
        let period = new Period(p[0], [block]);
        p[1] = period.merkleRoot();

        await bridge.submitPeriod(p[0], p[1], {from: bob}).should.be.fulfilled;

        const transferProof = period.proof(transfer);
        const outputIndex = 1;

        await exitHandler.startExit(transferProof, outputIndex);

        const aliceBalanceBefore = await nativeToken.balanceOf(alice);

        await exitHandler.finalizeTopExit(nativeTokenColor);

        const aliceBalanceAfter = await nativeToken.balanceOf(alice);

        aliceBalanceBefore.plus(50).should.be.bignumber.equal(aliceBalanceAfter);

      });

      it('Should allow to exit NFT utxo', async () => {
        const nftToken = await SpaceDustNFT.new();
        await sendTransaction(nftToken, 'initialize');

        let receipt = await nftToken.mint(alice, 10, true, 2);
        const tokenId = receipt.logs[0].args.tokenId;
        const tokenIdStr = tokenId.toString(10);

        receipt = await exitHandler.registerToken(nftToken.address, true);
        const nftColor = receipt.logs[0].args.color.toNumber();
        
        // deposit
        await nftToken.approve(exitHandler.address, tokenId);
        receipt = await exitHandler.deposit(alice, tokenId, nftColor, { from: alice }).should.be.fulfilled;        
        const depositId = receipt.logs[0].args.depositId.toNumber();


        const deposit = Tx.deposit(depositId, tokenIdStr, alice, nftColor);
        // transfer to bob
        let transfer = Tx.transfer(
          [new Input(new Outpoint(deposit.hash(), 0))],
          [new Output(tokenIdStr, bob, nftColor)]
        );
        transfer = transfer.sign([alicePriv]);

        // include in block and period
        const p = [];
        p[0] = await bridge.tipHash();
        let block = new Block(33).addTx(deposit).addTx(transfer);
        let period = new Period(p[0], [block]);
        p[1] = period.merkleRoot();

        await bridge.submitPeriod(p[0], p[1], { from: bob }).should.be.fulfilled;

        const proof = period.proof(transfer);

        // withdraw output
        assert.equal(await nftToken.ownerOf(tokenId), exitHandler.address);
        const event = await exitHandler.startExit(proof, 0, { from: bob });
        const outpoint = new Outpoint(
          event.logs[0].args.txHash,
          event.logs[0].args.outIndex.toNumber()
        );
        await exitHandler.finalizeTopExit(nftColor);
        assert.equal(await nftToken.ownerOf(tokenId), bob);
        // exit was markeed as finalized
        assert.equal((await exitHandler.exits(outpoint.getUtxoId()))[3], true);
      });

      it('Should allow to exit only for utxo owner', async () => {
        const depositAmount = 100;
        const nativeTokenColor = 0;

        await nativeToken.approve(exitHandler.address, 1000);
        await exitHandler.deposit(alice, depositAmount, nativeTokenColor).should.be.fulfilled;

        const deposit = Tx.deposit(0, depositAmount, alice);
        let transfer = Tx.transfer(
          [new Input(new Outpoint(deposit.hash(), 0))],
          [new Output(50, bob), new Output(50, alice)]
        );
        transfer = transfer.sign([alicePriv]);

        const p = [];
        p[0] = await bridge.tipHash();
        let block = new Block(33).addTx(deposit).addTx(transfer);
        let period = new Period(p[0], [block]);
        p[1] = period.merkleRoot();

        await bridge.submitPeriod(p[0], p[1], {from: bob}).should.be.fulfilled;

        const transferProof = period.proof(transfer);
        const outputIndex = 1;

        await exitHandler.startExit(transferProof, outputIndex, {from: bob}).should.be.rejectedWith(EVMRevert);
      });

      it('Should allow to challenge exit', async () => {
        const depositAmount = 100;
        const nativeTokenColor = 0;
        const depositId = 0;

        await nativeToken.approve(exitHandler.address, 1000);
        await exitHandler.deposit(alice, depositAmount, nativeTokenColor).should.be.fulfilled;

        const deposit = Tx.deposit(depositId, depositAmount, alice);
        let transfer = Tx.transfer(
          [new Input(new Outpoint(deposit.hash(), 0))],
          [new Output(50, bob), new Output(50, alice)]
        );
        transfer = transfer.sign([alicePriv]);

        // utxo that will have spend exit utxo
        let spend = Tx.transfer(
          [new Input(new Outpoint(transfer.hash(), 0))],
          [new Output(50, charlie)]
        );
        spend = spend.sign([bobPriv]);

        const p = [];
        p[0] = await bridge.tipHash();
        let block = new Block(33).addTx(deposit).addTx(transfer).addTx(spend);
        let period = new Period(p[0], [block]);
        p[1] = period.merkleRoot();

        await bridge.submitPeriod(p[0], p[1], {from: bob}).should.be.fulfilled;

        const transferProof = period.proof(transfer);
        const spendProof = period.proof(spend);

        // withdraw output
        const event = await exitHandler.startExit(transferProof, 0, { from: bob });
        const outpoint = new Outpoint(
          event.logs[0].args.txHash,
          event.logs[0].args.outIndex.toNumber()
        );
        assert.equal(outpoint.getUtxoId(), spend.inputs[0].prevout.getUtxoId());


        // challenge exit and make sure exit is removed
        let exit = await exitHandler.exits(outpoint.getUtxoId());
        assert.equal(exit[2], bob);
        await exitHandler.challengeExit(spendProof, transferProof, 0, 0);
        exit = await exitHandler.exits(outpoint.getUtxoId());
        assert.equal((await exitHandler.tokens(0))[1], 1);
        const bal1 = await nativeToken.balanceOf(bob);
        await exitHandler.finalizeTopExit(0);
        const bal2 = await nativeToken.balanceOf(bob);
        // check transfer didn't happen
        assert.equal(bal1.toNumber(), bal2.toNumber());
        // check exit was evicted from PriorityQueue
        assert.equal((await exitHandler.tokens(0))[1], 0);
        assert.equal(exit[2], '0x0000000000000000000000000000000000000000');
      });

      it('Should allow to challenge NFT exit', async () => {

        const nftToken = await SpaceDustNFT.new();
        await sendTransaction(nftToken, 'initialize');

        let receipt = await nftToken.mint(alice, 10, true, 2);
        const tokenId = receipt.logs[0].args.tokenId;
        const tokenIdStr = tokenId.toString(10);

        receipt = await exitHandler.registerToken(nftToken.address, true);
        const nftColor = receipt.logs[0].args.color.toNumber();
        
        // deposit
        await nftToken.approve(exitHandler.address, tokenId);
        receipt = await exitHandler.deposit(alice, tokenId, nftColor, { from: alice }).should.be.fulfilled;        
        const depositId = receipt.logs[0].args.depositId.toNumber();

        const deposit = Tx.deposit(depositId, tokenIdStr, alice, nftColor);
        
        // transfer to bob
        let transfer = Tx.transfer(
          [new Input(new Outpoint(deposit.hash(), 0))],
          [new Output(tokenIdStr, bob, nftColor)]
        );
        transfer = transfer.sign([alicePriv]);

        // utxo that will have spend exit utxo
        let spend = Tx.transfer(
          [new Input(new Outpoint(transfer.hash(), 0))],
          [new Output(tokenIdStr, charlie, nftColor)]
        );
        spend = spend.sign([bobPriv]);

         // include in block and period
        const p = [];
        p[0] = await bridge.tipHash();
        let block = new Block(33).addTx(deposit).addTx(transfer).addTx(spend);
        let period = new Period(p[0], [block]);
        p[1] = period.merkleRoot();

        await bridge.submitPeriod(p[0], p[1], { from: bob }).should.be.fulfilled;

        const transferProof = period.proof(transfer);
        const spendProof = period.proof(spend);
        
        // withdraw output
        const event = await exitHandler.startExit(transferProof, 0, { from: bob });
        const outpoint = new Outpoint(
          event.logs[0].args.txHash,
          event.logs[0].args.outIndex.toNumber()
        );
        assert.equal(outpoint.getUtxoId(), spend.inputs[0].prevout.getUtxoId());
        // challenge exit and make sure exit is removed
        let exit = await exitHandler.exits(outpoint.getUtxoId());
        assert.equal(exit[2], bob);
        
        await exitHandler.challengeExit(spendProof, transferProof, 0, 0);        
        exit = await exitHandler.exits(outpoint.getUtxoId());
        // check that exit was deleted
        assert.equal(exit[2], '0x0000000000000000000000000000000000000000');
      });

    });

  });

});