
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

import { encodeCall } from 'zos-lib';
import { TestHelper } from 'zos';

const Bridge = artifacts.require('Bridge');
const Vault = artifacts.require('Vault');
const MintableToken = artifacts.require('MockMintableToken');
const SimpleToken = artifacts.require('SimpleToken');
const SpaceDustNFT = artifacts.require('SpaceDustNFT');

const should = chai
  .use(chaiAsPromised)
  .use(chaiBigNumber(web3.BigNumber))
  .should();

const sendTransaction = (target, method, args, values, opts) => {
  const data = encodeCall(method, args, values);
  return target.sendTransaction(Object.assign({ data }, opts));
};

contract('Vault', (accounts) => {
  const alice = accounts[0];
  const bob = accounts[1];
  const charlie = accounts[2];
  const proxyAdmin = accounts[9];

  describe('Test', function() {
    let bridge;
    let vault;
    let nativeToken;
    const maxReward = 50;
    const parentBlockInterval = 0;

    beforeEach(async () => {
      this.project = await TestHelper({from: proxyAdmin});
      //nativeToken = await this.project.createProxy(MintableToken);
      nativeToken = await MintableToken.new();
      await sendTransaction(nativeToken, 'initialize'); 
      
      bridge = await this.project.createProxy(Bridge);
      await sendTransaction(bridge, 
        'initialize', 
        ['uint256','uint256','address', 'address'],
        [parentBlockInterval, maxReward, nativeToken.address, alice]);

      vault = await this.project.createProxy(Vault);
      await sendTransaction(vault, 
        'initialize', 
        ['address', 'address'],
        [bridge.address, alice]);

      await bridge.setOperator(bob);
      // At this point alice is the owner of bridge and vault and has 10000 tokens
      // Bob is the bridge operator and exitHandler and has 0 tokens
      // Note: all txs in these tests originate from alice unless otherwise specified
    });

    describe('Register Token', async () => {
      it('Bridge native token gets register at 0 on construction', async () => {
        const nativeToken = await MintableToken.new();
        await sendTransaction(nativeToken, 'initialize');
        
        const bridge = await this.project.createProxy(Bridge);
        await sendTransaction(bridge, 
          'initialize', 
          ['uint256','uint256','address', 'address'],
          [parentBlockInterval, maxReward, nativeToken.address, alice]);

        const vault = await this.project.createProxy(Vault);
        await sendTransaction(vault, 
          'initialize', 
          ['address', 'address'],
          [bridge.address, alice]);

        const tokenZeroAddr = (await vault.tokens(0))[0];
        tokenZeroAddr.should.be.equal(nativeToken.address);
      });

      it('Owner can register ERC20 token', async () => {
        const newToken = await SimpleToken.new();
        await newToken.initialize();

        await vault.registerToken(newToken.address, false).should.be.fulfilled;

        const tokenOneAddr = (await vault.tokens(1))[0];
        tokenOneAddr.should.be.equal(newToken.address);
      });

      it('Owner can register ERC721 token', async () => {
        const newNFTtoken = await SpaceDustNFT.new();
        await sendTransaction(newNFTtoken, 'initialize');

        await vault.registerToken(newNFTtoken.address, true).should.be.fulfilled;

        // NFTs have their own space
        const NFTstartIndex = 32769;
        const tokenTwoAddr = (await vault.tokens(NFTstartIndex))[0];
        tokenTwoAddr.should.be.equal(newNFTtoken.address);
      });

      it('Non-owner can not register token', async () => {
        const newToken = await SimpleToken.new();
        await newToken.initialize();

        await vault.registerToken(newToken.address, false, {from : charlie}).should.be.rejectedWith(EVMRevert);
      });
    });

  });

});