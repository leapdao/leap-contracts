
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import ethUtil from 'ethereumjs-util';
import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const { BN } = web3.utils;
const AdminableProxy = artifacts.require('AdminableProxy');
const Bridge = artifacts.require('Bridge');
const Vault = artifacts.require('Vault');
const SwapRegistry = artifacts.require('SwapRegistry');
const SwapExchange = artifacts.require('SwapExchange');
const NativeToken = artifacts.require('NativeToken');
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

  const deployToken = async () => NativeToken.new("Token", "TOK", 18);

  describe('Test', () => {
    let bridge;
    let vault;
    let swapRegistry;
    let nativeToken;
    let proxy;
    const parentBlockInterval = 0;
    const initialTotalSupply = new BN(web3.utils.toWei('7000000', 'ether')); // 7kk
    const inflationRate = new BN(2637549827);  // ~ 100% in 262800 periods
    const taxRate = 0.5; // 50%

    beforeEach(async () => {
      nativeToken = await deployToken();
      await nativeToken.mint(accounts[0], initialTotalSupply);

      const bridgeCont = await Bridge.new();
      let data = await bridgeCont.contract.methods.initialize(parentBlockInterval).encodeABI();
      proxy = await AdminableProxy.new(bridgeCont.address, data, {from: accounts[2]});
      bridge = await Bridge.at(proxy.address);

      data = await bridge.contract.methods.setOperator(bob).encodeABI();
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

      const vaultCont = await Vault.new();
      data = await vaultCont.contract.methods.initialize(bridge.address).encodeABI();
      proxy = await AdminableProxy.new(vaultCont.address, data,  {from: accounts[2]});
      vault = await Vault.at(proxy.address);

      // register first token
      data = await vault.contract.methods.registerToken(nativeToken.address, false).encodeABI();
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

      swapRegistry = await SwapRegistry.new();
      data = await swapRegistry.contract.methods.initialize(bridge.address, vault.address, 0).encodeABI();
      proxy = await AdminableProxy.new(swapRegistry.address, data,  {from: accounts[2]});
      swapRegistry = await SwapRegistry.at(proxy.address);

      // set tax to 50%
      data = await swapRegistry.contract.methods.setTaxRate(500).encodeABI();
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
        const reward = initialTotalSupply.mul(inflationRate).div(new BN(web3.utils.toWei('0.001', 'ether')));

        assert(taxBalBefore.add(reward.div(new BN(1 / taxRate))).eq(taxBalAfter));
        assert(bobBalAfter.eq(bobBalBefore.add(reward.sub(reward.div(new BN(1 / taxRate))))));

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

        assert(taxBalBefore.eq(taxBalAfter));
        assert(bobBalBefore.eq(bobBalAfter));
      });

      it('should receive less than inflation cap if more than 50% staked', async () => {
        const val = initialTotalSupply.div(new BN(4)).mul(new BN(3));
        await nativeToken.transfer(bob, val);

        const prevPeriodHash = await bridge.tipHash();
        const oracleRoot = `0x000000000000000000000003${bob.replace('0x', '')}`;
        const newPeriodHash = merkelize(txRoot1, oracleRoot);
        await bridge.submitPeriod(prevPeriodHash, newPeriodHash, {from: bob}).should.be.fulfilled;

        const bobBalBefore = await nativeToken.balanceOf(bob);
        const taxBalBefore = await nativeToken.balanceOf(accounts[2]);
        const staked = bobBalBefore;

        await swapRegistry.claim(3, [txRoot1, oracleRoot], {from: bob}).should.be.fulfilled;

        const bobBalAfter = await nativeToken.balanceOf(bob);
        const taxBalAfter = await nativeToken.balanceOf(accounts[2]);
        let reward = initialTotalSupply.mul(inflationRate).div(new BN(web3.utils.toWei('0.001', 'ether')));
        reward = reward.mul(initialTotalSupply.sub(staked)).mul(staked).mul(new BN(4)).div(initialTotalSupply);

        assert(taxBalBefore.add(reward.div(new BN(1 / taxRate))).eq(taxBalAfter));
        assert(bobBalBefore.add(reward.sub(reward.div(new BN(1 / taxRate)))).eq(bobBalAfter));
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
    const poaReward = web3.utils.toWei('3500000', 'ether');

    before(async () => {
      nativeToken = await deployToken();

      const bridgeCont = await Bridge.new();
      let data = await bridgeCont.contract.methods.initialize(parentBlockInterval).encodeABI();
      proxy = await AdminableProxy.new(bridgeCont.address, data, {from: accounts[2]});
      bridge = await Bridge.at(proxy.address);

      data = await bridge.contract.methods.setOperator(bob).encodeABI();
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

      gov = await MinGov.new(0);
      await proxy.changeAdmin(gov.address, {from: accounts[2]});

      const vaultCont = await Vault.new();
      data = await vaultCont.contract.methods.initialize(bridge.address).encodeABI();
      proxy = await AdminableProxy.new(vaultCont.address, data,  {from: accounts[2]});
      vault = await Vault.at(proxy.address);

      // register first token
      data = await vault.contract.methods.registerToken(nativeToken.address, false).encodeABI();
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

      swapRegistry = await SwapRegistry.new();

      data = await swapRegistry.contract.methods.initialize(bridge.address, vault.address, poaReward).encodeABI();
      proxy = await AdminableProxy.new(swapRegistry.address, data,  {from: accounts[2]});
      swapRegistry = await SwapRegistry.at(proxy.address);

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
      assert.equal(total, web3.utils.toWei('7000000', 'ether'));

      // withdraw all tax
      await gov.withdrawTax(nativeToken.address);
      const bal = await nativeToken.balanceOf(accounts[0]);
      assert.equal(bal, web3.utils.toWei('7000000', 'ether'));
    });
  });

  describe('Test', () => {
    let swapRegistry;
    let nativeToken;

    before(async () => {
      nativeToken = await deployToken();

      const vaultCont = await Vault.new();
      let data = await vaultCont.contract.methods.initialize(accounts[0]).encodeABI();
      let proxy = await AdminableProxy.new(vaultCont.address, data,  {from: accounts[2]});
      const vault = await Vault.at(proxy.address);

      // register first token
      data = await vault.contract.methods.registerToken(nativeToken.address, false).encodeABI();
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

      const exchangeBlueprint = await SwapExchange.new();
      swapRegistry = await SwapRegistry.new();

      data = await swapRegistry.contract.methods.initialize(accounts[0], vault.address, 0).encodeABI();
      proxy = await AdminableProxy.new(swapRegistry.address, data,  {from: accounts[2]});
      swapRegistry = await SwapRegistry.at(proxy.address);

      data = await swapRegistry.contract.methods.setExchangeCodeAddr(exchangeBlueprint.address).encodeABI();
      await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;
    });

    describe('Swap Exchange', async () => {
      it('should allow to register new swap market', async () => {
        const token = await deployToken();
        await swapRegistry.createExchange(token.address);
        const exchangeAddr = await swapRegistry.getExchange(token.address);
        const exchange = await SwapExchange.at(exchangeAddr);
        const decimals = await exchange.decimals();
        assert.equal(decimals.toNumber(), 18);
      });
    });
  });
});