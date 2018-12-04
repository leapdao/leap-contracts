
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
const AdminableProxy = artifacts.require('AdminableProxy');

const should = chai
  .use(chaiAsPromised)
  .use(chaiBigNumber(web3.BigNumber))
  .should();

contract('Bridge', (accounts) => {

  describe('Test', function() {
    let bridge;
    const maxReward = 50;
    const parentBlockInterval = 0;

    beforeEach(async () => {
      const bridgeCont = await Bridge.new();
      const data = await bridgeCont.contract.initialize.getData(parentBlockInterval, maxReward);
      const proxy = await AdminableProxy.new(bridgeCont.address, data);
      bridge = Bridge.at(proxy.address);
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
        await bridge.setOperator(accounts[1]);
        const prevPeriodHash = await bridge.tipHash();
        const newPeriodHash = '0x0100000000000000000000000000000000000000000000000000000000000000';

        await bridge.submitPeriod(prevPeriodHash, newPeriodHash, {from: accounts[1]}).should.be.fulfilled;

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });
    });
  });

});