
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import ethUtil from 'ethereumjs-util';
import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const AdminableProxy = artifacts.require('AdminableProxy');
const Bridge = artifacts.require('Bridge');
const SwapRegistry = artifacts.require('SwapRegistry');
const MintableToken = artifacts.require('MintableToken');

contract('SwapRegistry', (accounts) => {
  const bob = accounts[1];
  const taxRate = 0.5;
  const claimPerYear = 100000;
  const inflationCap = 0.5;

  describe('Test', () => {
    let bridge;
    let swapRegistry;
    let nativeToken;
    let proxy;
    const parentBlockInterval = 0;

    beforeEach(async () => {
      nativeToken = await MintableToken.new();

      const bridgeCont = await Bridge.new();
      let data = await bridgeCont.contract.initialize.getData(parentBlockInterval);
      proxy = await AdminableProxy.new(bridgeCont.address, data, {from: accounts[2]});
      bridge = Bridge.at(proxy.address);

      data = await bridge.contract.setOperator.getData(bob);
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

      swapRegistry = await SwapRegistry.new();
      data = await swapRegistry.contract.initialize.getData(bridge.address, nativeToken.address, taxRate * 1000, claimPerYear);
      proxy = await AdminableProxy.new(swapRegistry.address, data,  {from: accounts[2]});
      swapRegistry = SwapRegistry.at(proxy.address);

      await nativeToken.addMinter(swapRegistry.address);

    });

    describe('Period claim', async () => {

      it('should receive inflation cap if less than 50% staked', async () => {
        const prevPeriodHash = await bridge.tipHash();

        const txRoot = '0x0101010101010101010101010101010101010101010101010101010101010101';
        const oracleRoot = `0x000000000000000000000003${bob.replace('0x', '')}`;
        const buffer = Buffer.alloc(64, 0);
        buffer.write(txRoot.replace('0x', ''), 'hex');
        buffer.write(oracleRoot.replace('0x', ''), 32, 'hex');
        const newPeriodHash = `0x${ethUtil.keccak256(buffer).toString('hex')}`;

        await bridge.submitPeriod(prevPeriodHash, newPeriodHash, {from: bob}).should.be.fulfilled;

        const bobBalBefore = await nativeToken.balanceOf(bob);
        const taxBalBefore = await nativeToken.balanceOf(accounts[2]);
        const total = (await nativeToken.totalSupply()).toNumber();

        await swapRegistry.claim(3, [txRoot, oracleRoot], {from: bob}).should.be.fulfilled;

        const bobBalAfter = await nativeToken.balanceOf(bob);
        const taxBalAfter = await nativeToken.balanceOf(accounts[2]);
        const reward = (total * inflationCap) / claimPerYear;
        assert.equal(taxBalBefore.add(reward * taxRate).toNumber(), taxBalAfter.toNumber());
        assert.equal(bobBalBefore.add(reward - (reward * taxRate)).toNumber(), bobBalAfter.toNumber());

        await swapRegistry.claim(3, [txRoot, oracleRoot], {from: bob}).should.be.rejectedWith(EVMRevert);

        assert.equal(reward * claimPerYear, total * inflationCap);
      });

      it('should receive no reward if all staked', async () => {
        await nativeToken.transfer(bob, 1000000000000);
        const prevPeriodHash = await bridge.tipHash();
        const txRoot = '0x0101010101010101010101010101010101010101010101010101010101010101';
        const oracleRoot = `0x000000000000000000000003${bob.replace('0x', '')}`;
        const buffer = Buffer.alloc(64, 0);
        buffer.write(txRoot.replace('0x', ''), 'hex');
        buffer.write(oracleRoot.replace('0x', ''), 32, 'hex');
        const newPeriodHash = `0x${ethUtil.keccak256(buffer).toString('hex')}`;

        await bridge.submitPeriod(prevPeriodHash, newPeriodHash, {from: bob}).should.be.fulfilled;

        const bobBalBefore = await nativeToken.balanceOf(bob);
        const taxBalBefore = await nativeToken.balanceOf(accounts[2]);

        await swapRegistry.claim(3, [txRoot, oracleRoot], {from: bob}).should.be.fulfilled;

        const bobBalAfter = await nativeToken.balanceOf(bob);
        const taxBalAfter = await nativeToken.balanceOf(accounts[2]);

        assert.equal(taxBalBefore.toNumber(), taxBalAfter.toNumber());
        assert.equal(bobBalBefore.toNumber(), bobBalAfter.toNumber());
      });

      it('should receive less than inflation cap if more than 50% staked', async () => {
        await nativeToken.transfer(bob, 750000000000);
        const prevPeriodHash = await bridge.tipHash();
        const txRoot = '0x0101010101010101010101010101010101010101010101010101010101010101';
        const oracleRoot = `0x000000000000000000000003${bob.replace('0x', '')}`;
        const buffer = Buffer.alloc(64, 0);
        buffer.write(txRoot.replace('0x', ''), 'hex');
        buffer.write(oracleRoot.replace('0x', ''), 32, 'hex');
        const newPeriodHash = `0x${ethUtil.keccak256(buffer).toString('hex')}`;

        await bridge.submitPeriod(prevPeriodHash, newPeriodHash, {from: bob}).should.be.fulfilled;

        const bobBalBefore = await nativeToken.balanceOf(bob);
        const taxBalBefore = await nativeToken.balanceOf(accounts[2]);
        const total = (await nativeToken.totalSupply()).toNumber();
        const staked = bobBalBefore.toNumber();

        await swapRegistry.claim(3, [txRoot, oracleRoot], {from: bob}).should.be.fulfilled;

        const bobBalAfter = await nativeToken.balanceOf(bob);
        const taxBalAfter = await nativeToken.balanceOf(accounts[2]);
        const reward = ((2 * staked) / claimPerYear) - ((2 * staked * staked) / (total * claimPerYear));

        assert.equal(taxBalBefore.add(reward * taxRate).toNumber(), taxBalAfter.toNumber());
        assert.equal(bobBalBefore.add(reward - (reward * taxRate)).toNumber(), bobBalAfter.toNumber());
      });

      it('should allow to claim multiple at once', async () => {
        const periodHash0 = await bridge.tipHash();
        const txRoot1 = '0x0101010101010101010101010101010101010101010101010101010101010101';
        const oracleRoot1 = `0x000000000000000000000003${bob.replace('0x', '')}`;
        let buffer = Buffer.alloc(64, 0);
        buffer.write(txRoot1.replace('0x', ''), 'hex');
        buffer.write(oracleRoot1.replace('0x', ''), 32, 'hex');
        const periodHash1 = `0x${ethUtil.keccak256(buffer).toString('hex')}`;

        await bridge.submitPeriod(periodHash0, periodHash1, {from: bob}).should.be.fulfilled;

        const txRoot2 = '0x0202020202020202020202020202020202020202020202020202020202020202';
        const oracleRoot2 = `0x000000000000000000000003${bob.replace('0x', '')}`;
        buffer = Buffer.alloc(64, 0);
        buffer.write(txRoot2.replace('0x', ''), 'hex');
        buffer.write(oracleRoot2.replace('0x', ''), 32, 'hex');
        const periodHash2 = `0x${ethUtil.keccak256(buffer).toString('hex')}`;

        await bridge.submitPeriod(periodHash1, periodHash2, {from: bob}).should.be.fulfilled;

        await swapRegistry.claim(3, [txRoot1, oracleRoot1, txRoot2, oracleRoot2], {from: bob}).should.be.fulfilled;
      });
    });

  });

});