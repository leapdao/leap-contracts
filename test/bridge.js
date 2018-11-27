
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
      // Bob is the bridge operator and exitHandler and has 0 tokens
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
    });
  });

});