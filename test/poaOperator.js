
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const Bridge = artifacts.require('Bridge');
const PoaOperator = artifacts.require('PoaOperator');
const AdminableProxy = artifacts.require('AdminableProxy');

contract('PoaOperator', (accounts) => {
  const alice = accounts[0];
  const bob = accounts[1];
  const admin = accounts[3];

  describe('Test', () => {
    let bridge;
    let operator;
    let proxy;
    const parentBlockInterval = 0;
    const epochLength = 3;

    before(async () => {
      const bridgeCont = await Bridge.new();
      let data = await bridgeCont.contract.methods.initialize(parentBlockInterval).encodeABI();
      const proxyBridge = await AdminableProxy.new(bridgeCont.address, data,  {from: admin});
      bridge = await Bridge.at(proxyBridge.address);

      const opCont = await PoaOperator.new();
      data = await opCont.contract.methods.initialize(bridge.address, epochLength).encodeABI();
      proxy = await AdminableProxy.new(opCont.address, data,  {from: admin});
      operator = await PoaOperator.at(proxy.address);

      data = await bridge.contract.methods.setOperator(operator.address).encodeABI();
      await proxyBridge.applyProposal(data, {from: admin});
    });

    describe('Slot', () => {
      const p = [];
      before(async () => {
        p[0] = await bridge.tipHash();
      });
      describe('Auction', () => {
        it('should prevent submission by empty slot', async () => {
          await operator.submitPeriod(0, p[0], '0x01', {from: alice}).should.be.rejectedWith(EVMRevert);
        });

        it('should allow to set slot and submit block', async () => {
          const data = await operator.contract.methods.setSlot(0, alice, alice).encodeABI();
          await proxy.applyProposal(data, {from: admin});
          await operator.submitPeriod(0, p[0], '0x01', { from: alice }).should.be.fulfilled;
          p[1] = await bridge.tipHash();
        });
        it('should allow to set slot and submit block with reward', async () => {
          const data = await operator.contract.methods.setSlot(1, bob, bob).encodeABI();
          await proxy.applyProposal(data, {from: admin});
          await operator.submitPeriodForReward(1, p[1], '0x02', { from: bob }).should.be.fulfilled;
          p[2] = await bridge.tipHash();
        });
      });
    });
  });

});