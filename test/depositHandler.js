
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const Bridge = artifacts.require('Bridge');
const DepositHandler = artifacts.require('DepositHandler');
const MintableToken = artifacts.require('MockMintableToken');
const SpaceDustNFT = artifacts.require('SpaceDustNFT');


contract('DepositHandler', (accounts) => {
  const alice = accounts[0];
  const bob = accounts[1];

  describe('Test', () => {
    let bridge;
    let depositHandler;
    let nativeToken;
    const maxReward = 50;
    const parentBlockInterval = 0;

    beforeEach(async () => {
      nativeToken = await MintableToken.new();
      bridge = await Bridge.new(parentBlockInterval, maxReward, nativeToken.address);
      depositHandler = await DepositHandler.new(bridge.address);
      await bridge.setOperator(bob);
      // At this point alice is the owner of bridge and depositHandler and has 10000 tokens
      // Bob is the bridge operator and exitHandler and has 0 tokens
      // Note: all txs in these tests originate from alice unless otherwise specified
    });

    describe('Deposit', async () => {
      it('Can deposit registered ERC20 and balance of depositHandler increases', async () => {
        await nativeToken.approve(depositHandler.address, 1000);

        const depositHandlerBalanceBefore = await nativeToken.balanceOf(depositHandler.address);

        const color = 0;
        const amount = 300;

        await depositHandler.deposit(alice, amount, color).should.be.fulfilled;

        const depositHandlerBalanceAfter = await nativeToken.balanceOf(depositHandler.address);
        const depositHandlerBalanceDiff = depositHandlerBalanceAfter.minus(depositHandlerBalanceBefore);

        depositHandlerBalanceDiff.should.be.bignumber.equal(amount);
      });

      it('Can deposit ERC721 and depositHandler becomes owner', async () => {
        const nftToken = await SpaceDustNFT.new();
        const receipt = await nftToken.mint(bob, 10, true, 2);
        const tokenId = receipt.logs[0].args._tokenId; // eslint-disable-line no-underscore-dangle
        const NFTcolor = 32769;

        await depositHandler.registerToken(nftToken.address).should.be.fulfilled;

        await nftToken.approve(depositHandler.address, tokenId, {from : bob});

        await depositHandler.deposit(bob, tokenId, NFTcolor, { from: bob }).should.be.fulfilled;

        const nftOwner = await nftToken.ownerOf(tokenId);
        nftOwner.should.be.equal(depositHandler.address);
      });

      it('Can not deposit non-registered token', async () => {
        const amount = 100;
        const color = 1;
        await depositHandler.deposit(alice, amount, color).should.be.rejectedWith(EVMRevert);
      });
    });

  });

});