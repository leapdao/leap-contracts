
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

const AdminUpgradeabilityProxy = artifacts.require('AdminUpgradeabilityProxy');
const Bridge = artifacts.require('Bridge');
const Vault = artifacts.require('Vault');
const MintableToken = artifacts.require('MockMintableToken');
const SimpleToken = artifacts.require('SimpleToken');
const SpaceDustNFT = artifacts.require('SpaceDustNFT');

const should = chai
  .use(chaiAsPromised)
  .use(chaiBigNumber(web3.BigNumber))
  .should();

contract('Vault', (accounts) => {
  const alice = accounts[0];
  const bob = accounts[1];
  const charlie = accounts[2];

  describe('Test', function() {
    let bridge;
    let vault;
    let nativeToken;
    const maxReward = 50;
    const parentBlockInterval = 0;

    beforeEach(async () => {
      nativeToken = await MintableToken.new();

      const bridgeCont = await Bridge.new();
      let data = await bridgeCont.contract.initialize.getData(parentBlockInterval, maxReward);
      let proxy = await AdminUpgradeabilityProxy.new(bridgeCont.address, data);
      bridge = Bridge.at(proxy.address);

      const vaultCont = await Vault.new();
      data = await vaultCont.contract.initialize.getData(bridge.address);
      proxy = await AdminUpgradeabilityProxy.new(vaultCont.address, data);
      vault = Vault.at(proxy.address);

      // register first token
      await vault.registerToken(nativeToken.address);
      await bridge.setOperator(bob);
      // At this point alice is the owner of bridge and vault and has 10000 tokens
      // Bob is the bridge operator and exitHandler and has 0 tokens
      // Note: all txs in these tests originate from alice unless otherwise specified
    });

    describe('Register Token', async () => {

      it('Owner can register ERC20 token', async () => {
        const newToken = await SimpleToken.new();

        await vault.registerToken(newToken.address).should.be.fulfilled;

        const tokenOneAddr = (await vault.tokens(1))[0];
        tokenOneAddr.should.be.equal(newToken.address);
      });

      it('Owner can register ERC721 token', async () => {
        const newNFTtoken = await SpaceDustNFT.new();

        await vault.registerToken(newNFTtoken.address).should.be.fulfilled;

        // NFTs have their own space
        const NFTstartIndex = 32769;
        const tokenTwoAddr = (await vault.tokens(NFTstartIndex))[0];
        tokenTwoAddr.should.be.equal(newNFTtoken.address);
      });

      it('Non-owner can not register token', async () => {
        const newToken = await SimpleToken.new();
        await vault.registerToken(newToken.address, {from: bob}).should.be.rejectedWith(EVMRevert);
      });
    });

  });

});