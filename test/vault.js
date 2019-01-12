
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import EVMRevert from './helpers/EVMRevert';

const AdminableProxy = artifacts.require('AdminableProxy');
const Bridge = artifacts.require('Bridge');
const Vault = artifacts.require('Vault');
const SimpleToken = artifacts.require('SimpleToken');
const SpaceDustNFT = artifacts.require('SpaceDustNFT');

contract('Vault', (accounts) => {
  const bob = accounts[1];

  describe('Test', () => {
    let bridge;
    let vault;
    let nativeToken;
    let proxy;
    const parentBlockInterval = 0;

    beforeEach(async () => {
      nativeToken = await SimpleToken.new();

      const bridgeCont = await Bridge.new();
      let data = await bridgeCont.contract.methods.initialize(parentBlockInterval).encodeABI();
      proxy = await AdminableProxy.new(bridgeCont.address, data, {from: accounts[2]});
      bridge = await Bridge.at(proxy.address);

      data = await bridge.contract.methods.setOperator(bob).encodeABI();
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

      const vaultCont = await Vault.new();
      data = await vaultCont.contract.methods.initialize(bridge.address).encodeABI();
      proxy = await AdminableProxy.new(vaultCont.address, data,  {from: accounts[2]});
      vault = await Vault.at(proxy.address);

      // register first token
      data = await vault.contract.methods.registerToken(nativeToken.address, false).encodeABI();
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;
      // At this point alice is the owner of bridge and vault and has 10000 tokens
      // Bob is the bridge operator and exitHandler and has 0 tokens
      // Note: all txs in these tests originate from alice unless otherwise specified
    });

    describe('Register Token', async () => {

      it('Owner can register ERC20 token', async () => {
        const newToken = await SimpleToken.new();

        const data = await vault.contract.methods.registerToken(newToken.address, false).encodeABI();
        await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

        const tokenOneAddr = (await vault.tokens(1))[0];
        tokenOneAddr.should.be.equal(newToken.address);
      });

      it('Owner can register ERC721 token', async () => {
        const newNFTtoken = await SpaceDustNFT.new();

        const data = await vault.contract.methods.registerToken(newNFTtoken.address, true).encodeABI();
        await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

        // NFTs have their own space
        const NFTstartIndex = 32769;
        const tokenTwoAddr = (await vault.tokens(NFTstartIndex))[0];
        tokenTwoAddr.should.be.equal(newNFTtoken.address);
      });

      it('Non-owner can not register token', async () => {
        const newToken = await SimpleToken.new();
        await vault.registerToken(newToken.address, false, {from: bob}).should.be.rejectedWith(EVMRevert);
      });
    });

  });

});