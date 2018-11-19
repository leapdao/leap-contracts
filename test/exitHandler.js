
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import EVMRevert from './helpers/EVMRevert';
import chai from 'chai';
import chaiBigNumber from 'chai-bignumber';
import chaiAsPromised from 'chai-as-promised';

import { Period, Block, Tx, Input, Output, Outpoint } from 'leap-core';

const Bridge = artifacts.require('Bridge');
const ExitHandler = artifacts.require('ExitHandler');
const PriorityQueue = artifacts.require('PriorityQueue');
const MintableToken = artifacts.require('MockMintableToken');
const SpaceDustNFT = artifacts.require('SpaceDustNFT');

const should = chai
  .use(chaiAsPromised)
  .use(chaiBigNumber(web3.BigNumber))
  .should();

contract('ExitHandler', (accounts) => {
  const alice = accounts[0];
  // This is from ganache GUI version
  const alicePriv = '0xbd54b17c48ac1fc91d5ef2ef02e9911337f8758e93c801b619e5d178094486cc';
  const bob = accounts[1];
  const charlie = accounts[2];

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
      nativeToken = await MintableToken.new();
      bridge = await Bridge.new(parentBlockInterval, maxReward, nativeToken.address);
      exitHandler = await ExitHandler.new(bridge.address, exitDuration, exitStake);
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

        let receipt = await nftToken.mint(alice, 10, true, 2);
        const tokenId = receipt.logs[0].args._tokenId;
        const tokenIdStr = tokenId.toString(10);

        receipt = await exitHandler.registerToken(nftToken.address);
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

      });

      it('Should allow to exit valid utxo at index 2', async () => {

      });
    });

  });

});