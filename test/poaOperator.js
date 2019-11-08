
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import { Period, Block, Tx, Input, Outpoint } from 'leap-core';
import { keccak256 } from 'ethereumjs-util';
import EVMRevert from './helpers/EVMRevert';

const time = require('./helpers/time');
require('./helpers/setup');

const merkelize = (hash1, hash2) => {
  const buffer = Buffer.alloc(64, 0);
  if (typeof hash1 === 'string' || hash1 instanceof String) {
    buffer.write(hash1.replace('0x', ''), 'hex');
  } else {
    hash1.copy(buffer);
  }
  if (typeof hash2 === 'string' || hash2 instanceof String) {
    buffer.write(hash2.replace('0x', ''), 32, 'hex');
  } else {
    hash2.copy(buffer, 32);
  }
  return `0x${keccak256(buffer).toString('hex')}`;
};

const Bridge = artifacts.require('Bridge');
const PoaOperator = artifacts.require('PoaOperatorMock');
const ExitHandler = artifacts.require('ExitHandler');
const AdminableProxy = artifacts.require('AdminableProxy');

contract('PoaOperator', (accounts) => {
  const alice = accounts[0];
  const bob = accounts[1];
  const admin = accounts[3];
  const CAS = '0xc000000000000000000000000000000000000000000000000000000000000000';
  const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';
  const CHALLENGE_DURATION = 3600;
  const CHALLENGE_STAKE = '100000000000000000';

  describe('Test', () => {
    let bridge;
    let operator;
    let proxy;
    let exitHandler
    const parentBlockInterval = 0;
    const epochLength = 3;
    const p = [];

    before(async () => {
      const bridgeCont = await Bridge.new();
      let data = await bridgeCont.contract.methods.initialize(parentBlockInterval).encodeABI();
      const proxyBridge = await AdminableProxy.new(bridgeCont.address, data,  {from: admin});
      bridge = await Bridge.at(proxyBridge.address);

      const vaultCont = await ExitHandler.new();
      data = await vaultCont.contract.methods.initializeWithExit(bridge.address, CHALLENGE_DURATION, CHALLENGE_STAKE).encodeABI();
      proxy = await AdminableProxy.new(vaultCont.address, data, {from: admin});
      exitHandler = await ExitHandler.at(proxy.address);

      const opCont = await PoaOperator.new();
      data = await opCont.contract.methods.initialize(bridge.address, exitHandler.address, epochLength, CHALLENGE_DURATION).encodeABI();
      proxy = await AdminableProxy.new(opCont.address, data,  {from: admin});
      operator = await PoaOperator.at(proxy.address);

      data = await bridge.contract.methods.setOperator(operator.address).encodeABI();
      await proxyBridge.applyProposal(data, {from: admin});
      p[0] = await bridge.tipHash();
    });
      
    describe('Slot Management', () => {
      it('should prevent submission by empty slot', async () => {
        await operator.submitPeriodWithCas(0, p[0], '0x01', '0xff', {from: alice}).should.be.rejectedWith(EVMRevert);
      });

      it('should allow to set slot and submit period with CAS', async () => {
        const data = await operator.contract.methods.setSlot(0, alice, alice).encodeABI();
        await proxy.applyProposal(data, {from: admin});
        await operator.submitPeriodWithCas(0, p[0], '0x01', CAS, { from: alice }).should.be.fulfilled;
        p[1] = await bridge.tipHash();
      });

      it('should allow to set slot and submit period without CAS', async () => {
        const data = await operator.contract.methods.setSlot(0, alice, alice).encodeABI();
        await proxy.applyProposal(data, {from: admin});
        await operator.submitPeriod(0, p[0], '0x01', { from: alice }).should.be.fulfilled;
        p[1] = await bridge.tipHash();
      });

      it('period proof should match contract', async () => {
        const data = await operator.contract.methods.setSlot(1, bob, bob).encodeABI();
        await proxy.applyProposal(data, {from: admin});

        const block = new Block(33);
        const depositTx = Tx.deposit(0, 1000, alice);
        block.addTx(depositTx);
        const prevPeriodRoot = await bridge.tipHash();
        const period = new Period(prevPeriodRoot, [block]);
        period.setValidatorData(1, bob, CAS);
        const proof = period.proof(depositTx);

        await operator.submitPeriodWithCas(1, p[1], period.merkleRoot(), CAS, { from: bob }).should.be.fulfilled;
        p[2] = await bridge.tipHash();
        assert.equal(p[2], proof[0]);
      });
    });

    describe('CryptoEconomic Agregate Signatures', () => {
      it('should allow to open and reject challenge', async () => {
        const block = new Block(65);
        const depositTx = Tx.deposit(0, 2000, alice);
        block.addTx(depositTx);
        const prevPeriodRoot = await bridge.tipHash();
        const period = new Period(prevPeriodRoot, [block]);
        period.setValidatorData(1, bob, CAS);
        const proof = period.proof(depositTx);

        await operator.submitPeriodWithCas(1, p[2], period.merkleRoot(), CAS, { from: bob }).should.be.fulfilled;
        p[3] = await bridge.tipHash();
        assert.equal(p[3], proof[0]);

        const validatorRoot = merkelize(`0x000000000000000000000001${bob.replace('0x', '')}`, ZERO);
        const consensusRoot = merkelize(period.merkleRoot(), ZERO);

        await operator.challengeCas(CAS, validatorRoot, consensusRoot, 1, {value: '100000000000000000'});

        let challenge = await operator.getChallenge(p[3], 1);
        assert.equal(challenge[0], accounts[0]);
        assert.equal(challenge[2], bob);

        const casRoot = merkelize(CAS, validatorRoot);
        const vote = Tx.periodVote(1, new Input(new Outpoint(consensusRoot, 0)));
        vote.sign(['0x7bc8feb5e1ce2927480de19d8bc1dc6874678c016ae53a2eec6a6e9df717bfac']);
        await operator.respondCas(consensusRoot, casRoot, 1, vote.inputs[0].v, vote.inputs[0].r, vote.inputs[0].s, accounts[0]);
        challenge = await operator.getChallenge(p[3], 1);
        assert.equal(challenge[1].toNumber(10), 0);
      });

      it('should allow to open and timeout challenge', async () => {
        const block = new Block(97);
        const depositTx = Tx.deposit(0, 3000, alice);
        block.addTx(depositTx);
        const prevPeriodRoot = await bridge.tipHash();
        const period = new Period(prevPeriodRoot, [block]);
        period.setValidatorData(1, bob, CAS);
        const proof = period.proof(depositTx);

        await operator.submitPeriodWithCas(1, p[3], period.merkleRoot(), CAS, { from: bob }).should.be.fulfilled;
        p[4] = await bridge.tipHash();
        assert.equal(p[4], proof[0]);

        const validatorRoot = merkelize(`0x000000000000000000000001${bob.replace('0x', '')}`, ZERO);
        const consensusRoot = merkelize(period.merkleRoot(), ZERO);

        await operator.challengeCas(CAS, validatorRoot, consensusRoot, 1, {value: '100000000000000000'});

        let challenge = await operator.getChallenge(p[4], 1);
        assert.equal(challenge[0], accounts[0]);
        assert.equal(challenge[2], bob);

        const casRoot = merkelize(CAS, validatorRoot);
        const periodRoot = merkelize(consensusRoot, casRoot);

        await operator.timeoutCas(periodRoot, 1).should.be.rejectedWith(EVMRevert);

        const exitTime = (await time.latest()) + CHALLENGE_DURATION;
        await time.increaseTo(exitTime);
        await operator.timeoutCas(periodRoot, 1);
        challenge = await operator.getChallenge(p[3], 1);
        const rsp = await bridge.periods(periodRoot);
        // check that period deleted
        assert.equal(rsp[0], 0);
        assert.equal(challenge[1].toNumber(10), 0);
      });
    });
  });


  describe('Governance', () => {
    let proxy;
    let operator;

    it('should allow to change epoch length', async () => {
      const opCont = await PoaOperator.new();
      let data = await opCont.contract.methods.initialize(accounts[0], accounts[0], 1, 3600).encodeABI();
      proxy = await AdminableProxy.new(opCont.address, data, { from: accounts[2] });
      operator = await PoaOperator.at(proxy.address);

      // set the first slot
      data = await operator.contract.methods.setSlot(0, alice, alice).encodeABI();
      await proxy.applyProposal(data, { from: accounts[2] });
      assert.equal(await operator.epochLength(), 1);

      // increase epoch length to 2 and set the second slot
      data = await operator.contract.methods.setEpochLength(2).encodeABI();
      await proxy.applyProposal(data, { from: accounts[2] });
      data = await operator.contract.methods.setSlot(1, bob, bob).encodeABI();
      await proxy.applyProposal(data, { from: accounts[2] });
      assert.equal(await operator.epochLength(), 2);

      // dont' allow to reduce epoch length beyond max slotId
      data = await operator.contract.methods.setEpochLength(1).encodeABI();
      await proxy.applyProposal(data, { from: accounts[2] });
      assert.equal(await operator.epochLength(), 2);

      // logout the largest slot and try set epoch length again
      const zero = '0x0000000000000000000000000000000000000000';
      data = await operator.contract.methods.setSlot(1, zero, zero).encodeABI();
      await proxy.applyProposal(data, { from: accounts[2] });
      await operator.setLastCompleteEpochForTest(2);
      await operator.activate(1);
      data = await operator.contract.methods.setEpochLength(1).encodeABI();
      await proxy.applyProposal(data, { from: accounts[2] });
      assert.equal(await operator.epochLength(), 1);
    });
  });

});