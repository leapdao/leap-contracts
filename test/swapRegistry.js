
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import ethUtil from 'ethereumjs-util';
import EVMRevert from './helpers/EVMRevert';

const AdminableProxy = artifacts.require('AdminableProxy');
const Bridge = artifacts.require('Bridge');
const SwapRegistry = artifacts.require('SwapRegistry');
const SimpleToken = artifacts.require('SimpleToken');

contract('SwapRegistry', (accounts) => {
  const bob = accounts[1];

  describe('Test', () => {
    let bridge;
    let swapRegistry;
    let nativeToken;
    let proxy;
    const parentBlockInterval = 0;

    beforeEach(async () => {
      nativeToken = await SimpleToken.new();

      const bridgeCont = await Bridge.new();
      let data = await bridgeCont.contract.initialize.getData(parentBlockInterval);
      proxy = await AdminableProxy.new(bridgeCont.address, data, {from: accounts[2]});
      bridge = Bridge.at(proxy.address);

      data = await bridge.contract.setOperator.getData(bob);
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

      swapRegistry = await SwapRegistry.new();
      data = await swapRegistry.contract.initialize.getData(bridge.address, nativeToken.address);
      proxy = await AdminableProxy.new(swapRegistry.address, data,  {from: accounts[2]});
      swapRegistry = SwapRegistry.at(proxy.address);

    });

    describe('Period claim', async () => {

      it('period submission can be claimed', async () => {
        const prevPeriodHash = await bridge.tipHash();

        const txRoot = '0x0101010101010101010101010101010101010101010101010101010101010101';
        const slotId = '0x0000000000000000000000000000000000000000000000000000000000000003';
        const buffer = Buffer.alloc(64, 0);
        buffer.write(txRoot.replace('0x', ''), 'hex');
        buffer.write(slotId.replace('0x', ''), 32, 'hex');
        const newPeriodHash = `0x${ethUtil.keccak256(buffer).toString('hex')}`;

        await bridge.submitPeriod(prevPeriodHash, newPeriodHash, {from: bob}).should.be.fulfilled;

        await swapRegistry.claim(3, [txRoot, slotId]).should.be.fulfilled;
      });
    });

  });

});