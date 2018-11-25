
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

const Bridge = artifacts.require('Bridge');
const MintableToken = artifacts.require('MockMintableToken');
const POSoperator = artifacts.require('POSoperator');

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
    let operator;
    const maxReward = 50;
    const parentBlockInterval = 0;

    beforeEach(async () => {
      nativeToken = await MintableToken.new();
      bridge = await Bridge.new(parentBlockInterval, maxReward, nativeToken.address);
      operator = await POSoperator.new(bridge.address);
      await bridge.setOperator(operator);
      // At this point alice is the owner of bridge and has 10000 tokens
      // Note: all txs in these tests originate from alice unless otherwise specified
    });

    describe('temp', async () => {
      
    });
  });

});