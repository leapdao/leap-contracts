
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
const Vault = artifacts.require('Vault');
const MintableToken = artifacts.require('MockMintableToken');
const POSoperator = artifacts.require('POSoperator');
const AdminUpgradeabilityProxy = artifacts.require('AdminUpgradeabilityProxy');

const should = chai
  .use(chaiAsPromised)
  .use(chaiBigNumber(web3.BigNumber))
  .should();

contract('PosOperator', (accounts) => {
  const alice = accounts[0];
  const bob = accounts[1];
  const charlie = accounts[2];

  describe('Test', function() {
    let bridge;
    let nativeToken;
    let operator;
    let vault;
    const maxReward = 50;
    const parentBlockInterval = 0;
    const epochLength = 3;

    before(async () => {
      nativeToken = await MintableToken.new();
      const bridgeCont = await Bridge.new();
      let data = await bridgeCont.contract.initialize.getData(parentBlockInterval, maxReward);
      let proxy = await AdminUpgradeabilityProxy.new(bridgeCont.address, data);
      bridge = Bridge.at(proxy.address);

      const vaultCont = await Vault.new();
      data = await vaultCont.contract.initialize.getData(bridge.address);
      proxy = await AdminUpgradeabilityProxy.new(vaultCont.address, data);
      vault = Vault.at(proxy.address);

      const opCont = await POSoperator.new();
      data = await opCont.contract.initialize.getData(bridge.address, vault.address, epochLength);
      proxy = await AdminUpgradeabilityProxy.new(opCont.address, data);
      operator = POSoperator.at(proxy.address);
      await bridge.setOperator(operator.address);
      // register first token
      await vault.registerToken(nativeToken.address);
      // At this point alice is the owner of bridge and has 10000 tokens
      // Note: all txs in these tests originate from alice unless otherwise specified
      nativeToken.transfer(bob, 1000);
      nativeToken.transfer(charlie, 1000);
    });

    describe('Slot', function() {
      const p = [];
      before(async () => {
        p[0] = await bridge.tipHash();
      });
      describe('Auction', function() {
        it('should prevent submission by unbonded validators', async () => {
          await operator.submitPeriod(0, p[0], '0x01', {from: alice}).should.be.rejectedWith(EVMRevert);
        });

        it('should allow to auction slot and submit block', async () => {
          await nativeToken.approve(operator.address, 1000, { from: alice });
          await operator.bet(0, 100, alice, alice, { from: alice });
          await operator.submitPeriod(0, p[0], '0x01', { from: alice }).should.be.fulfilled;
          p[1] = await bridge.tipHash();
        });

        it('should update slot instead of auction for same owner', async () => {
          const bal1 = await nativeToken.balanceOf(alice);
          await operator.bet(2, 10, alice, alice, {from: alice}).should.be.fulfilled;
          await operator.bet(2, 30, alice, alice, {from: alice}).should.be.fulfilled;
          const bal2 = await nativeToken.balanceOf(alice);
          const slot = await operator.slots(2);
          assert.equal(Number(slot[2]), 30); // stake === 30
          assert.equal(Number(slot[7]), 0); // newStake === 0
          // all token missing in balance should be accounted in slot
          assert.equal(bal1.sub(bal2).toNumber(), Number(slot[2]));
        });

        it('should prevent auctining for lower price', async () => {
          await nativeToken.approve(operator.address, 1000, {from: bob});
          await operator.bet(0, 131, bob, bob, {from: bob}).should.be.fulfilled;
          await operator.bet(0, 129, bob, bob, {from: bob}).should.be.rejectedWith(EVMRevert);
        });

        it('should allow to auction for higer price',  async () => {
          await operator.bet(0, 170, bob, bob, {from: bob}).should.be.fulfilled;
        });

        it('should allow submission when slot auctioned in same epoch', async () => {
          await operator.submitPeriod(0, p[1], '0x02', {from: alice}).should.be.fulfilled;
          p[2] = await bridge.tipHash();
        });

        it('should prevent submission by auctioned slot in later epoch', async () => {
          await operator.submitPeriod(0, p[2], '0x03', {from: alice}).should.be.rejectedWith(EVMRevert);
          await operator.submitPeriod(0, p[2], '0x03', {from: bob}).should.be.rejectedWith(EVMRevert);
        });

        it('allow to auction another slot', async () => {
          await nativeToken.approve(operator.address, 1000, { from: charlie });
          await operator.bet(1, 100, charlie, charlie, { from: charlie });
        });

        it('should allow to activate auctioned slot and submit', async () => {
          // increment Epoch
          await operator.submitPeriod(1, p[2], '0x03', {from: charlie}).should.be.fulfilled;
          p[3] = await bridge.tipHash();
          await operator.submitPeriod(1, p[3], '0x04', {from: charlie}).should.be.fulfilled;
          p[4] = await bridge.tipHash();
          await operator.submitPeriod(1, p[4], '0x05', {from: charlie}).should.be.fulfilled;
          p[5] = await bridge.tipHash();
          await operator.submitPeriod(1, p[5], '0x06', {from: charlie}).should.be.fulfilled;
          p[6] = await bridge.tipHash();
          // activate and submit by bob
          const bal1 = await nativeToken.balanceOf(alice);
          await operator.activate(0);
          const bal2 = await nativeToken.balanceOf(alice);
          assert.equal(bal1.add(100).toNumber(), bal2.toNumber());
          await operator.submitPeriod(0, p[6], '0x07', {from: bob}).should.be.fulfilled;
          p[7] = await bridge.tipHash();
        });

        it('should allow to logout', async () => {
          await operator.bet(0, 0, bob, bob, {from: charlie}).should.be.rejectedWith(EVMRevert);
          await operator.bet(0, 0, bob, bob, {from: bob}).should.be.fulfilled;
        });

        it('should prevent submission by logged-out slot in later epoch', async () => {
          // increment epoch
          await operator.submitPeriod(1, p[7], '0x08', {from: charlie}).should.be.fulfilled;
          p[8] = await bridge.tipHash();
          // try to submit when logged out
          await operator.submitPeriod(0, p[8], '0x09', {from: bob}).should.be.rejectedWith(EVMRevert);
        });

        it('should allow to withdraw after logout', async () => {
          // increment epoch
          await operator.submitPeriod(1, p[8], '0x09', {from: charlie}).should.be.fulfilled;
          p[9] = await bridge.tipHash();
          await operator.submitPeriod(1, p[9], '0x0a', {from: charlie}).should.be.fulfilled;
          p[10] = await bridge.tipHash();
          await operator.submitPeriod(1, p[10], '0x0b', {from: charlie}).should.be.fulfilled;
          p[11] = await bridge.tipHash();
          // activate logout
          nativeToken.transfer(operator.address, 2000);
          const bal1 = await nativeToken.balanceOf(bob);
          await operator.activate(0);
          const bal2 = await nativeToken.balanceOf(bob);
          assert.equal(bal1.add(170).toNumber(), bal2.toNumber());
          // including genesis period, we have submiteed 12 periods in total:
          // epoch 1: period 0 - 2
          // epoch 2: period 3 - 5
          // epoch 3: period 6 - 8
          // epoch 4: period 9 - 11
          // =>  now we should be in epoch 5
          const lastEpoch = await operator.lastCompleteEpoch();
          assert.equal(lastEpoch.toNumber(), 4);
          const height = await bridge.periods(p[11]);
          // we should have 12 blocks at this time
          assert.equal(height[1].toNumber(), 12);
        });
      });
    });
  });

});