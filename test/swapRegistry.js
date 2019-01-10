
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
const SwapExchange = artifacts.require('SwapExchange');
const MintableToken = artifacts.require('MintableToken');
const MinGov = artifacts.require('./MinGov.sol');

const txRoot1 = '0x0101010101010101010101010101010101010101010101010101010101010101';
const txRoot2 = '0x0202020202020202020202020202020202020202020202020202020202020202';

const merkelize = (hash1, hash2) => {
  const buffer = Buffer.alloc(64, 0);
  buffer.write(hash1.replace('0x', ''), 'hex');
  buffer.write(hash2.replace('0x', ''), 32, 'hex');
  return `0x${ethUtil.keccak256(buffer).toString('hex')}`;
};

contract('SwapRegistry', (accounts) => {
  const bob = accounts[1];

  describe('Test', () => {
    let bridge;
    let vault;
    let swapRegistry;
    let nativeToken;
    let proxy;
    const parentBlockInterval = 0;
    const initialTotalSupply = new web3.BigNumber(10).pow(18).mul(7000000); // 7kk
    const inflationRate = 2637549827;  // ~ 100% in 262800 periods
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
      data = await swapRegistry.contract.initialize.getData(bridge.address, vault.address, 0);
      proxy = await AdminableProxy.new(swapRegistry.address, data,  {from: accounts[2]});
      swapRegistry = SwapRegistry.at(proxy.address);

      // set tax to 50%
      data = await swapRegistry.contract.setTaxRate.getData(500);
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

      // make swapRegistry a minter
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
        const reward = initialTotalSupply.mul(inflationRate).div(new web3.BigNumber(10).pow(15));

        assert.equal(taxBalBefore.add(reward.mul(taxRate)).toNumber(), taxBalAfter.toNumber());
        assert.equal(bobBalBefore.add(reward.sub(reward.mul(taxRate))).toNumber(), bobBalAfter.toNumber());

        await swapRegistry.claim(3, [txRoot1, oracleRoot], {from: bob}).should.be.rejectedWith(EVMRevert);
      });

      it('should receive no reward if all staked', async () => {
        await nativeToken.transfer(bob, initialTotalSupply);

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
        await nativeToken.transfer(bob, initialTotalSupply.div(4).mul(3));

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
        let reward = initialTotalSupply.mul(inflationRate).div(new web3.BigNumber(10).pow(15));
        reward = reward.mul(initialTotalSupply.sub(staked)).mul(staked).mul(4).div(initialTotalSupply);

        assert.equal(taxBalBefore.add(reward.mul(taxRate)).toNumber(), taxBalAfter.toNumber());
        assert.equal(bobBalBefore.add(reward.sub(reward.mul(taxRate))).toNumber(), bobBalAfter.toNumber());
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
    let gov;
    let swapRegistry;
    let nativeToken;
    let proxy;
    const parentBlockInterval = 0;
    const poaReward = new web3.BigNumber(10).pow(24).mul(3.5);

    before(async () => {
      nativeToken = await MintableToken.new();

      const bridgeCont = await Bridge.new();
      let data = await bridgeCont.contract.initialize.getData(parentBlockInterval);
      proxy = await AdminableProxy.new(bridgeCont.address, data, {from: accounts[2]});
      bridge = Bridge.at(proxy.address);

      data = await bridge.contract.setOperator.getData(bob);
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

      gov = await MinGov.new(0);
      await proxy.changeAdmin(gov.address, {from: accounts[2]});

      const vaultCont = await Vault.new();
      data = await vaultCont.contract.initialize.getData(bridge.address);
      proxy = await AdminableProxy.new(vaultCont.address, data,  {from: accounts[2]});
      vault = Vault.at(proxy.address);

      // register first token
      data = await vault.contract.registerToken.getData(nativeToken.address, false);
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

      swapRegistry = await SwapRegistry.new();

      data = await swapRegistry.contract.initialize.getData(bridge.address, vault.address, poaReward);
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
      assert.equal(total.toNumber(), new web3.BigNumber(10).pow(24).mul(7).toNumber());

      // withdraw all tax
      await gov.withdrawTax(nativeToken.address);
      const bal = await nativeToken.balanceOf(accounts[0]);
      assert.equal(bal.toNumber(), new web3.BigNumber(10).pow(24).mul(7).toNumber());
    });
  });

  describe('Test', () => {
    let swapRegistry;
    let nativeToken;

    before(async () => {
      nativeToken = await MintableToken.new();

      const vaultCont = await Vault.new();
      let data = await vaultCont.contract.initialize.getData(accounts[0]);
      let proxy = await AdminableProxy.new(vaultCont.address, data,  {from: accounts[2]});
      const vault = Vault.at(proxy.address);

      // register first token
      data = await vault.contract.registerToken.getData(nativeToken.address, false);
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

      const exchangeBlueprint = await SwapExchange.new();
      swapRegistry = await SwapRegistry.new();

      data = await swapRegistry.contract.initialize.getData(accounts[0], vault.address, 0);
      proxy = await AdminableProxy.new(swapRegistry.address, data,  {from: accounts[2]});
      swapRegistry = SwapRegistry.at(proxy.address);

      data = await swapRegistry.contract.setExchangeCodeAddr.getData(exchangeBlueprint.address);
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;
    });

    describe('Swap Exchange', async () => {
      it('should allow to register new swap market', async () => {
        const token = await MintableToken.new();
        await swapRegistry.createExchange(token.address);
        const exchangeAddr = await swapRegistry.getExchange(token.address);
        const exchange = SwapExchange.at(exchangeAddr);
        const decimals = await exchange.decimals();
        assert.equal(decimals.toNumber(), 18);
      });
    });
  });
});