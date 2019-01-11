
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
const NativeToken = artifacts.require('NativeToken');
const SpaceDustNFT = artifacts.require('SpaceDustNFT');

contract('Vault', (accounts) => {
  const bob = accounts[1];
  const supply = new web3.BigNumber(10).pow(18).mul(10000); // 10k

  describe('Test', () => {
    let bridge;
    let vault;
    let nativeToken;
    let proxy;
    const parentBlockInterval = 0;

    beforeEach(async () => {
      nativeToken = await NativeToken.new('0x53696d706c6520546f6b656e', '0x534d54', 18);
      await nativeToken.mint(accounts[0], supply);

      const bridgeCont = await Bridge.new();
      let data = await bridgeCont.contract.initialize.getData(parentBlockInterval);
      proxy = await AdminableProxy.new(bridgeCont.address, data, {from: accounts[2]});
      bridge = Bridge.at(proxy.address);

      data = await bridge.contract.setOperator.getData(bob);
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

      const vaultCont = await Vault.new();
      data = await vaultCont.contract.initialize.getData(bridge.address);
      proxy = await AdminableProxy.new(vaultCont.address, data,  {from: accounts[2]});
      vault = Vault.at(proxy.address);

      // register first token
      data = await vault.contract.registerToken.getData(nativeToken.address, false);
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;
      // At this point alice is the owner of bridge and vault and has 10000 tokens
      // Bob is the bridge operator and exitHandler and has 0 tokens
      // Note: all txs in these tests originate from alice unless otherwise specified
    });

    describe('Register Token', async () => {

      it('Owner can register ERC20 token', async () => {
        const newToken = await NativeToken.new('0x53696d706c6520546f6b656e', '0x534d54', 18);
        await newToken.mint(accounts[0], supply);

        const data = await vault.contract.registerToken.getData(newToken.address, false);
        await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

        const tokenOneAddr = (await vault.tokens(1))[0];
        tokenOneAddr.should.be.equal(newToken.address);
      });

      it('Owner can register ERC721 token', async () => {
        const newNFTtoken = await SpaceDustNFT.new();

        const data = await vault.contract.registerToken.getData(newNFTtoken.address, true);
        await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

        // NFTs have their own space
        const NFTstartIndex = 32769;
        const tokenTwoAddr = (await vault.tokens(NFTstartIndex))[0];
        tokenTwoAddr.should.be.equal(newNFTtoken.address);
      });

      it('Non-owner can not register token', async () => {
        const newToken = await NativeToken.new('0x53696d706c6520546f6b656e', '0x534d54', 18);
        await newToken.mint(accounts[0], supply);
        await vault.registerToken(newToken.address, false, {from: bob}).should.be.rejectedWith(EVMRevert);
      });
    });

  });

});