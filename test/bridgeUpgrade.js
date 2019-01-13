
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const Bridge = artifacts.require('Bridge');
const BridgeNew = artifacts.require('BridgeUpgradeTest');
const AdminableProxy = artifacts.require('AdminableProxy');

contract('Bridge', (accounts) => {

  describe('Upgrade', () => {
    let bridge;
    const parentBlockInterval = 0;
    let proxy;
    const operator = accounts[0];
    const user = accounts[1];
    const admin = accounts[2];
    const imp = '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3';

    before(async () => {
        const bridgeCont = await Bridge.new();
        let data = await bridgeCont.contract.methods.initialize(parentBlockInterval).encodeABI();
        proxy = await AdminableProxy.new(bridgeCont.address, data, {from: admin});
        bridge = await Bridge.at(proxy.address);
        data = await bridge.contract.methods.setOperator(operator).encodeABI();
        await proxy.applyProposal(data, {from: admin});
    });

    describe('Upgrading contract', async() => {
        it('It should be possible to upgrade contract', async() => {
            const logicAddr = await web3.eth.getStorageAt(proxy.address, imp);
            const bridgeNew = await BridgeNew.new();
            bridge = await BridgeNew.at(proxy.address);
            await bridge.isUpgraded().should.be.rejectedWith(EVMRevert); // new function (isUpgraded()) cannot be called before actual uprgade
            await proxy.upgradeTo(bridgeNew.address, {from: admin}).should.be.fulfilled;
            const logicAddrNew = await web3.eth.getStorageAt(proxy.address, imp);
            logicAddrNew.should.not.be.equal(logicAddr);
            const bridgeUpgraded = await bridge.isUpgraded(); // new function (isUpgraded()) can be called after actual uprgade
            assert.equal(bridgeUpgraded,true);
        })
    })

    describe('Upgraded contract calls', async () => {
      it('Operator can submit period', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const newPeriodHash = '0x0100000000000000000000000000000000000000000000000000000000000000';

        const receipt = await bridge.submitPeriod2(prevPeriodHash, newPeriodHash);
        const logMsg = receipt.logs[0].event;
        assert.equal(logMsg, "LogMessage"); // Check if new line of code emitting log event is working

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });

      it('Operator can be set', async() => {
        const data = await bridge.contract.methods.setOperator(user).encodeABI();
        const receipt = await proxy.applyProposal(data, {from: admin});
        const logMsg = receipt.receipt.rawLogs[1].topics[0];
        logMsg.should.be.equal("0x96561394bac381230de4649200e8831afcab1f451881bbade9ef209f6dd30480");
      });
    });
  });

});