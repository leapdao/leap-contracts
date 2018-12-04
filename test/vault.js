
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import EVMRevert from './helpers/EVMRevert';

const Bridge = artifacts.require('Bridge');
const Vault = artifacts.require('Vault');
const MintableToken = artifacts.require('MockMintableToken');
const SimpleToken = artifacts.require('SimpleToken');
const SpaceDustNFT = artifacts.require('SpaceDustNFT');

contract('Vault', (accounts) => {
  const bob = accounts[1];
  const charlie = accounts[2];

  describe('Test', () => {
    let bridge;
    let vault;
    let nativeToken;
    const maxReward = 50;
    const parentBlockInterval = 0;

    beforeEach(async () => {
      nativeToken = await MintableToken.new();
      bridge = await Bridge.new(parentBlockInterval, maxReward, nativeToken.address);
      vault = await Vault.new(bridge.address);
      await bridge.setOperator(bob);
      // At this point alice is the owner of bridge and vault and has 10000 tokens
      // Bob is the bridge operator and exitHandler and has 0 tokens
      // Note: all txs in these tests originate from alice unless otherwise specified
    });

    describe('Register Token', async () => {
      it('Bridge native token gets register at 0 on construction', async () => {
        nativeToken = await MintableToken.new();
        bridge = await Bridge.new(parentBlockInterval, maxReward, nativeToken.address);
        vault = await Vault.new(bridge.address);

        const tokenZeroAddr = (await vault.tokens(0))[0];
        tokenZeroAddr.should.be.equal(nativeToken.address);
      });

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

        await vault.registerToken(newToken.address, {from : charlie}).should.be.rejectedWith(EVMRevert);
      });
    });

  });

});