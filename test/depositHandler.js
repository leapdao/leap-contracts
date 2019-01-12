
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const AdminableProxy = artifacts.require('AdminableProxy');
const Bridge = artifacts.require('Bridge');
const DepositHandler = artifacts.require('DepositHandler');
const SimpleToken = artifacts.require('SimpleToken');
const SpaceDustNFT = artifacts.require('SpaceDustNFT');


contract('DepositHandler', (accounts) => {
  const alice = accounts[0];
  const bob = accounts[1];

  describe('Test', () => {
    let bridge;
    let depositHandler;
    let proxy;
    let nativeToken;
    const parentBlockInterval = 0;

    beforeEach(async () => {
      nativeToken = await SimpleToken.new();
      const bridgeCont = await Bridge.new();
      let data = await bridgeCont.contract.methods.initialize(parentBlockInterval).encodeABI();
      proxy = await AdminableProxy.new(bridgeCont.address, data, {from: accounts[2]});
      bridge = await Bridge.at(proxy.address);
      data = await bridge.contract.methods.setOperator(bob).encodeABI();
      await proxy.applyProposal(data, {from: accounts[2]});

      const vaultCont = await DepositHandler.new();
      data = await vaultCont.contract.methods.initialize(bridge.address).encodeABI();
      proxy = await AdminableProxy.new(vaultCont.address, data, {from: accounts[2]});
      depositHandler = await DepositHandler.at(proxy.address);

      // register first token
      data = await depositHandler.contract.methods.registerToken(nativeToken.address, false).encodeABI();
      await proxy.applyProposal(data, {from: accounts[2]});

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
        const depositHandlerBalanceDiff = depositHandlerBalanceAfter.sub(depositHandlerBalanceBefore);

        assert.equal(depositHandlerBalanceDiff, amount);
      });

      it('Can deposit ERC721 and depositHandler becomes owner', async () => {
        const nftToken = await SpaceDustNFT.new();
        const receipt = await nftToken.mint(bob, 10, true, 2);
        const { tokenId } = receipt.logs[0].args; // eslint-disable-line no-underscore-dangle
        const NFTcolor = 32769;

        const data = await depositHandler.contract.methods.registerToken(nftToken.address, true).encodeABI();
        await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

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