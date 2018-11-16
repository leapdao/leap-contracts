
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import EVMRevert from './helpers/EVMRevert';
import { Period, Block, Tx, Input, Output, Outpoint } from 'leap-core';
import chai from 'chai';
import chaiBigNumber from 'chai-bignumber';
import chaiAsPromised from 'chai-as-promised';

const Bridge = artifacts.require('Bridge');
const MintableToken = artifacts.require('MockMintableToken');
const SimpleToken = artifacts.require('SimpleToken');
const SpaceDustNFT = artifacts.require('SpaceDustNFT');

const should = chai
  .use(chaiAsPromised)
  .use(chaiBigNumber(web3.BigNumber))
  .should();

contract('Bridge', (accounts) => {
  const alice = accounts[0];
  const bob = accounts[1];
  const charlie = accounts[2];

  describe('Test', function() {
    let bridge;
    let nativeToken;
    const maxReward = 50;
    const parentBlockInterval = 0;

    beforeEach(async () => {
      nativeToken = await MintableToken.new();
      bridge = await Bridge.new(parentBlockInterval, maxReward, nativeToken.address);
      await bridge.setOperator(bob);
      // At this point alice is the owner of bridge and has 10000 tokens
      // Bob is the bridge operator and has 0 tokens
      // Note: all txs in these tests originate from alice unless otherwise specified
    });

    describe('Submit Period', async () => {
      it('Operator can submit period', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const newPeriodHash = '0x0100000000000000000000000000000000000000000000000000000000000000';

        const bobBalanceBefore = await nativeToken.balanceOf(bob);
        // this is to assure correct reward calculation
        bobBalanceBefore.should.be.bignumber.equal(0);

        await bridge.submitPeriod(prevPeriodHash, newPeriodHash, {from: bob}).should.be.fulfilled;

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
        const bobBalanceAfter = await nativeToken.balanceOf(bob);
        const bobBalanceDiff = bobBalanceAfter.minus(bobBalanceBefore);
        // At this point the total stake is 0 (bob's balance) so bob should receive maxReward
        bobBalanceDiff.should.be.bignumber.equal(maxReward);
      });

      it('Non-operator cannot submit period', async () => {

      });

      it('Reverts when submitting exsisting period', async () => {

      });

      it('Reverts when parent does not exsist', async () => {

      });

      it('Reverts when trying to submit before parent block interval passed', async () => {

      });

      it('Period reward is computed correctly', async () => {

      });
    });

    describe('Register Token', async () => {
      it('Native token gets register at 0 on construction and bridge is set as minter', async () => {
        const nativeToken = await MintableToken.new();
        const bridge = await Bridge.new(parentBlockInterval, maxReward, nativeToken.address);

        const tokenZeroAddr = (await bridge.tokens(0))[0];
        tokenZeroAddr.should.be.equal(nativeToken.address);

        const minter = await nativeToken.minter();
        minter.should.be.equal(bridge.address);
      });

      it('Owner can register ERC20 token', async () => {
        const newToken = await SimpleToken.new();

        await bridge.registerToken(newToken.address).should.be.fulfilled;

        const tokenOneAddr = (await bridge.tokens(1))[0];
        tokenOneAddr.should.be.equal(newToken.address);
      });

      it('Owner can register ERC721 token', async () => {
        const newNFTtoken = await SpaceDustNFT.new();

        await bridge.registerToken(newNFTtoken.address).should.be.fulfilled;

        // NFTs have their own space
        const NFTstartIndex = 32769;
        const tokenTwoAddr = (await bridge.tokens(NFTstartIndex))[0];
        tokenTwoAddr.should.be.equal(newNFTtoken.address);
      });

      it('Non-owner can not register token', async () => {
        const newToken = await SimpleToken.new();

        await bridge.registerToken(newToken.address, {from : charlie}).should.be.rejectedWith(EVMRevert);
      });
    });

    describe('Deposit', async () => {
      it('Can deposit registered ERC20 and balance of bridge increases', async () => {
        await nativeToken.approve(bridge.address, 1000);

        const bridgeBalanceBefore = await nativeToken.balanceOf(bridge.address);

        const color = 0;
        const amount = 300;

        await bridge.deposit(alice, amount, color).should.be.fulfilled;

        const bridgeBalanceAfter = await nativeToken.balanceOf(bridge.address);
        const bridgeBalanceDiff = bridgeBalanceAfter.minus(bridgeBalanceBefore);

        bridgeBalanceDiff.should.be.bignumber.equal(amount);
      });

      it('Can deposit ERC721 and bridge becomes owner', async () => {
        const nftToken = await SpaceDustNFT.new();
        const receipt = await nftToken.mint(bob, 10, true, 2);
        const tokenId = receipt.logs[0].args._tokenId;
        const NFTcolor = 32769;

        await bridge.registerToken(nftToken.address).should.be.fulfilled;

        await nftToken.approve(bridge.address, tokenId, {from : bob});

        await bridge.deposit(bob, tokenId, NFTcolor, { from: bob }).should.be.fulfilled;

        const nftOwner = await nftToken.ownerOf(tokenId);
        nftOwner.should.be.equal(bridge.address);
      });

      it('Can not deposit non-registered token', async () => {
        const amount = 100;
        const color = 1;
        await bridge.deposit(alice, amount, color).should.be.rejectedWith(EVMRevert);
      });
    });
  });

});