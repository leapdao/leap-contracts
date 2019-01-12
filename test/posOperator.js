
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import EVMRevert from './helpers/EVMRevert';

const Bridge = artifacts.require('Bridge');
const Vault = artifacts.require('Vault');
const SimpleToken = artifacts.require('SimpleToken');
const POSoperator = artifacts.require('POSoperator');
const AdminableProxy = artifacts.require('AdminableProxy');

contract('PosOperator', (accounts) => {
  const alice = accounts[0];
  const bob = accounts[1];
  const charlie = accounts[2];

  describe('Test', () => {
    let bridge;
    let nativeToken;
    let operator;
    let vault;
    const parentBlockInterval = 0;
    const epochLength = 3;

    before(async () => {
      nativeToken = await SimpleToken.new();
      const bridgeCont = await Bridge.new();
      let data = await bridgeCont.contract.methods.initialize(parentBlockInterval).encodeABI();
      const proxyBridge = await AdminableProxy.new(bridgeCont.address, data,  {from: accounts[3]});
      bridge = await Bridge.at(proxyBridge.address);

      const vaultCont = await Vault.new();
      data = await vaultCont.contract.methods.initialize(bridge.address).encodeABI();
      const proxyVault = await AdminableProxy.new(vaultCont.address, data,  {from: accounts[3]});
      vault = await Vault.at(proxyVault.address);

      const opCont = await POSoperator.new();
      data = await opCont.contract.methods.initialize(bridge.address, vault.address, epochLength).encodeABI();
      const proxyPos = await AdminableProxy.new(opCont.address, data,  {from: accounts[3]});
      operator = await POSoperator.at(proxyPos.address);

      data = await bridge.contract.methods.setOperator(operator.address).encodeABI();
      await proxyBridge.applyProposal(data, {from: accounts[3]});
      // register first token
      data = await vault.contract.methods.registerToken(nativeToken.address, false).encodeABI();
      await proxyVault.applyProposal(data, {from: accounts[3]});
      // At this point alice is the owner of bridge and has 10000 tokens
      // Note: all txs in these tests originate from alice unless otherwise specified
      nativeToken.transfer(bob, 1000);
      nativeToken.transfer(charlie, 1000);
    });

    describe('Slot', () => {
      const p = [];
      before(async () => {
        p[0] = await bridge.tipHash();
      });
      describe('Auction', () => {
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
          assert.equal(bal1.toNumber() + 100, bal2.toNumber());
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
          assert.equal(bal1.toNumber() + 170, bal2.toNumber());
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