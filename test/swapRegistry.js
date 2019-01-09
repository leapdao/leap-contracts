
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
const Vault = artifacts.require('Vault');
const SwapRegistry = artifacts.require('SwapRegistry');
const MintableToken = artifacts.require('MintableToken');

const txRoot1 = '0x0101010101010101010101010101010101010101010101010101010101010101';
const txRoot2 = '0x0202020202020202020202020202020202020202020202020202020202020202';
const txRoot3 = '0x0303030303030303030303030303030303030303030303030303030303030303';
const txRoot4 = '0x0404040404040404040404040404040404040404040404040404040404040404';
const txRoot5 = '0x0505050505050505050505050505050505050505050505050505050505050505';

const merkelize = (hash1, hash2) => {
  const buffer = Buffer.alloc(64, 0);
  buffer.write(hash1.replace('0x', ''), 'hex');
  buffer.write(hash2.replace('0x', ''), 32, 'hex');
  return `0x${ethUtil.keccak256(buffer).toString('hex')}`;
};

contract('SwapRegistry', (accounts) => {
  const bob = accounts[1];

  const inflationCap = 0.5;

  describe('Test', () => {
    let bridge;
    let vault;
    let swapRegistry;
    let nativeToken;
    let proxy;
    const parentBlockInterval = 0;
    const initialTotalSupply = new web3.BigNumber(10).pow(12); // 10 * 10^4 * 10^8
    const periodsPerYear = 262800; // 30 * 24 * 365
    const taxRate = 0.5; // 50%

    beforeEach(async () => {
      nativeToken = await MintableToken.new();
      await nativeToken.mint(accounts[0], initialTotalSupply);

      const bridgeCont = await Bridge.new();
      let data = await bridgeCont.contract.initialize.getData(parentBlockInterval);
      proxy = await AdminableProxy.new(bridgeCont.address, data, {from: accounts[2]});
      bridge = Bridge.at(proxy.address);

      data = await bridge.contract.setOperator.getData(bob);
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

      const vaultCont = await Vault.new();
      data = await vaultCont.contract.initialize.getData(bridge.address);
      proxy = await AdminableProxy.new(vaultCont.address, data,  {from: accounts[2]});
      vault = Vault.at(proxy.address);

      // register first token
      data = await vault.contract.registerToken.getData(nativeToken.address, false);
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

      swapRegistry = await SwapRegistry.new();
      data = await swapRegistry.contract.initialize.getData(bridge.address, vault.address, taxRate * 1000, periodsPerYear, initialTotalSupply);
      proxy = await AdminableProxy.new(swapRegistry.address, data,  {from: accounts[2]});
      swapRegistry = SwapRegistry.at(proxy.address);

      await nativeToken.addMinter(swapRegistry.address);

    });

    describe('Period claim', async () => {

      it('should receive inflation cap if less than 50% staked', async () => {
        const prevPeriodHash = await bridge.tipHash();
        const oracleRoot = `0x000000000000000000000003${bob.replace('0x', '')}`;
        const newPeriodHash = merkelize(txRoot1, oracleRoot);
        await bridge.submitPeriod(prevPeriodHash, newPeriodHash, {from: bob}).should.be.fulfilled;

        const bobBalBefore = await nativeToken.balanceOf(bob);
        const taxBalBefore = await nativeToken.balanceOf(accounts[2]);

        await swapRegistry.claim(3, [txRoot1, oracleRoot], {from: bob}).should.be.fulfilled;

        const bobBalAfter = await nativeToken.balanceOf(bob);
        const taxBalAfter = await nativeToken.balanceOf(accounts[2]);
        const reward = initialTotalSupply.mul(inflationCap).div(periodsPerYear).toNumber();

        assert.equal(taxBalBefore.add(Math.floor(reward * taxRate)).toNumber(), taxBalAfter.toNumber());
        assert.equal(bobBalBefore.add(Math.round(reward - (reward * taxRate))).toNumber(), bobBalAfter.toNumber());

        await swapRegistry.claim(3, [txRoot1, oracleRoot], {from: bob}).should.be.rejectedWith(EVMRevert);

        assert.equal(reward * periodsPerYear, initialTotalSupply.mul(inflationCap).toNumber());
      });

      it('should receive no reward if all staked', async () => {
        await nativeToken.transfer(bob, 1000000000000);

        const prevPeriodHash = await bridge.tipHash();
        const oracleRoot = `0x000000000000000000000003${bob.replace('0x', '')}`;
        const newPeriodHash = merkelize(txRoot1, oracleRoot);
        await bridge.submitPeriod(prevPeriodHash, newPeriodHash, {from: bob}).should.be.fulfilled;

        const bobBalBefore = await nativeToken.balanceOf(bob);
        const taxBalBefore = await nativeToken.balanceOf(accounts[2]);

        await swapRegistry.claim(3, [txRoot1, oracleRoot], {from: bob}).should.be.fulfilled;

        const bobBalAfter = await nativeToken.balanceOf(bob);
        const taxBalAfter = await nativeToken.balanceOf(accounts[2]);

        assert.equal(taxBalBefore.toNumber(), taxBalAfter.toNumber());
        assert.equal(bobBalBefore.toNumber(), bobBalAfter.toNumber());
      });

      it('should receive less than inflation cap if more than 50% staked', async () => {
        await nativeToken.transfer(bob, 750000000000);

        const prevPeriodHash = await bridge.tipHash();
        const oracleRoot = `0x000000000000000000000003${bob.replace('0x', '')}`;
        const newPeriodHash = merkelize(txRoot1, oracleRoot);
        await bridge.submitPeriod(prevPeriodHash, newPeriodHash, {from: bob}).should.be.fulfilled;

        const bobBalBefore = await nativeToken.balanceOf(bob);
        const taxBalBefore = await nativeToken.balanceOf(accounts[2]);
        const staked = bobBalBefore.toNumber();

        await swapRegistry.claim(3, [txRoot1, oracleRoot], {from: bob}).should.be.fulfilled;

        const bobBalAfter = await nativeToken.balanceOf(bob);
        const taxBalAfter = await nativeToken.balanceOf(accounts[2]);
        const reward = initialTotalSupply.sub(staked).mul(staked).mul(4).mul(inflationCap).div(initialTotalSupply).div(periodsPerYear).toNumber();

        assert.equal(taxBalBefore.add(Math.round(reward * taxRate)).toNumber(), taxBalAfter.toNumber());
        assert.equal(bobBalBefore.add(Math.round(reward - (reward * taxRate))).toNumber(), bobBalAfter.toNumber());
      });

      it('should allow to claim multiple at once', async () => {
        const periodHash0 = await bridge.tipHash();
        const oracleRoot1 = `0x000000000000000000000003${bob.replace('0x', '')}`;
        const periodHash1 = merkelize(txRoot1, oracleRoot1);
        const oracleRoot2 = `0x000000000000000000000003${bob.replace('0x', '')}`;
        const periodHash2 = merkelize(txRoot2, oracleRoot2);

        await bridge.submitPeriod(periodHash0, periodHash1, {from: bob}).should.be.fulfilled;
        await bridge.submitPeriod(periodHash1, periodHash2, {from: bob}).should.be.fulfilled;

        await swapRegistry.claim(3, [txRoot1, oracleRoot1, txRoot2, oracleRoot2], {from: bob}).should.be.fulfilled;
      });
    });

  });

  describe('Simulation', () => {
    let bridge;
    let vault;
    let swapRegistry;
    let nativeToken;
    let proxy;
    const parentBlockInterval = 0;
    // we want to mint 7M in the first half year at an inflation rate of 50%
    // so virtualSupply is set to 28M
    const initialTotalSupply = new web3.BigNumber(10).pow(14).mul(28); // 10 * 10^4 * 10^8
    const periodsPerYear = 4;
    const taxRate = 1; // 100%    

    before(async () => {
      nativeToken = await MintableToken.new();

      const bridgeCont = await Bridge.new();
      let data = await bridgeCont.contract.initialize.getData(parentBlockInterval);
      proxy = await AdminableProxy.new(bridgeCont.address, data, {from: accounts[2]});
      bridge = Bridge.at(proxy.address);

      data = await bridge.contract.setOperator.getData(bob);
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

      const vaultCont = await Vault.new();
      data = await vaultCont.contract.initialize.getData(bridge.address);
      proxy = await AdminableProxy.new(vaultCont.address, data,  {from: accounts[2]});
      vault = Vault.at(proxy.address);

      // register first token
      data = await vault.contract.registerToken.getData(nativeToken.address, false);
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

      swapRegistry = await SwapRegistry.new();

      data = await swapRegistry.contract.initialize.getData(bridge.address, vault.address, taxRate * 1000, periodsPerYear, initialTotalSupply);
      proxy = await AdminableProxy.new(swapRegistry.address, data,  {from: accounts[2]});
      swapRegistry = SwapRegistry.at(proxy.address);

      await nativeToken.addMinter(swapRegistry.address);

    });

    it('at start', async () => {
      const total = await nativeToken.totalSupply();
      assert.equal(total.toNumber(), 0);
    });

    it('after 6 month', async () => {
      const periodHash0 = await bridge.tipHash();
      const oracleRoot1 = `0x000000000000000000000003${bob.replace('0x', '')}`;
      const periodHash1 = merkelize(txRoot1, oracleRoot1);
      const oracleRoot2 = `0x000000000000000000000003${bob.replace('0x', '')}`;
      const periodHash2 = merkelize(txRoot2, oracleRoot2);

      await bridge.submitPeriod(periodHash0, periodHash1, {from: bob}).should.be.fulfilled;
      await bridge.submitPeriod(periodHash1, periodHash2, {from: bob}).should.be.fulfilled;

      await swapRegistry.claim(3, [txRoot1, oracleRoot1, txRoot2, oracleRoot2], {from: bob}).should.be.fulfilled;

      const total = await nativeToken.totalSupply();
      assert.equal(total.toNumber(), initialTotalSupply.div(4).toNumber());
    });
    it('at 1 year', async () => {
      const periodHash0 = await bridge.tipHash();
      const oracleRoot1 = `0x000000000000000000000003${bob.replace('0x', '')}`;
      const periodHash1 = merkelize(txRoot3, oracleRoot1);
      const oracleRoot2 = `0x000000000000000000000003${bob.replace('0x', '')}`;
      const periodHash2 = merkelize(txRoot4, oracleRoot2);

      await bridge.submitPeriod(periodHash0, periodHash1, {from: bob}).should.be.fulfilled;
      await bridge.submitPeriod(periodHash1, periodHash2, {from: bob}).should.be.fulfilled;

      await swapRegistry.claim(3, [txRoot3, oracleRoot1, txRoot4, oracleRoot2], {from: bob}).should.be.fulfilled;

      const total = await nativeToken.totalSupply();
      assert.equal(total.toNumber(), initialTotalSupply.div(2).toNumber());
    });

    it('after 1 year', async () => {
      const prevPeriodHash = await bridge.tipHash();
      const oracleRoot = `0x000000000000000000000003${bob.replace('0x', '')}`;
      const newPeriodHash = merkelize(txRoot5, oracleRoot);
      await bridge.submitPeriod(prevPeriodHash, newPeriodHash, {from: bob}).should.be.fulfilled;

      await swapRegistry.claim(3, [txRoot5, oracleRoot], {from: bob}).should.be.fulfilled;

      const lastYearTotalSupply = await swapRegistry.lastYearTotalSupply();
      assert.equal(lastYearTotalSupply.toNumber(), initialTotalSupply.div(2).toNumber());
    });

  });

});