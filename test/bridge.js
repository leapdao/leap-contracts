
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

require('./helpers/setup');

const Bridge = artifacts.require('Bridge');
const AdminableProxy = artifacts.require('AdminableProxy');

contract('Bridge', (accounts) => {

  describe('Test', () => {
    let bridge;
    let proxy;
    const parentBlockInterval = 0;

    beforeEach(async () => {
      const bridgeCont = await Bridge.new();
      let data = bridgeCont.contract.methods.initialize(parentBlockInterval).encodeABI();
      proxy = await AdminableProxy.new(bridgeCont.address, data, {from: accounts[2]});
      bridge = await Bridge.at(proxy.address);
      data = await bridgeCont.contract.methods.setOperator(accounts[0]).encodeABI();
      await proxy.applyProposal(data, {from: accounts[2]});
    });

    describe('Submit Period', async () => {
      it('Operator can submit period', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const newPeriodHash = '0x0100000000000000000000000000000000000000000000000000000000000000';

        await bridge.submitPeriod(prevPeriodHash, newPeriodHash).should.be.fulfilled;

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });

      it('Operator can be set', async() => {
        const data = await bridge.contract.methods.setOperator(accounts[1]).encodeABI();
        await proxy.applyProposal(data, {from: accounts[2]});
        const prevPeriodHash = await bridge.tipHash();
        const newPeriodHash = '0x0100000000000000000000000000000000000000000000000000000000000000';

        await bridge.submitPeriod(prevPeriodHash, newPeriodHash, {from: accounts[1]}).should.be.fulfilled;

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });
    });
  });

  describe('Governance', () => {
    let bridge;
    let proxy;
    const parentBlockInterval = 0;

    it('can set blockInterval', async() => {
      const bridgeCont = await Bridge.new();
      let data = await bridgeCont.contract.methods.initialize(parentBlockInterval).encodeABI();
      proxy = await AdminableProxy.new(bridgeCont.address, data, {from: accounts[2]});
      bridge = await Bridge.at(proxy.address);
      data = await bridge.contract.methods.setParentBlockInterval(10).encodeABI();
      await proxy.applyProposal(data, {from: accounts[2]});
      const newInterval = await bridge.getParentBlockInterval();
      assert.equal(newInterval.toNumber(), 10);
    });
  });
});