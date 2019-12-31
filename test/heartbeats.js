
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import { Period, Block, Tx, Input, Outpoint, Output } from 'leap-core';
import EVMRevert from './helpers/EVMRevert';

const time = require('./helpers/time');
require('./helpers/setup');

const Bridge = artifacts.require('Bridge');
const PoaOperator = artifacts.require('PoaOperatorMock');
const ExitHandler = artifacts.require('ExitHandler');
const AdminableProxy = artifacts.require('AdminableProxy');

contract('PoaOperator Heartbeats', (accounts) => {
    const alice = accounts[0];
    const alicePriv = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';
    const admin = accounts[3];
  const CAS = '0x8000000000000000000000000000000000000000000000000000000000000000';
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
      const validatorSlot = 0;
      const minimumPulse = 0;
      const heartbeatColor = 200;
   

    beforeEach(async () => {
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

      data = await operator.contract.methods.setSlot(validatorSlot, alice, alice).encodeABI();
      await proxy.applyProposal(data, {from: admin});

	data = await operator.contract.methods.setHeartbeatParams(minimumPulse, heartbeatColor).encodeABI();
	await proxy.applyProposal(data, {from: admin});
	
    });

    describe('Heartbeats', () => {
	it('Can challenge offline validators', async () => {
	    
	    
	    // validator has been offline, challenge him
	    await operator.challengeBeat(validatorSlot, {value: CHALLENGE_STAKE});

	    // should not be able to complete challenge before timeout
	    await operator.timeoutBeat(validatorSlot).should.be.rejectedWith(EVMRevert);

	    const timeoutTime = (await time.latest()) + CHALLENGE_DURATION;
            await time.increaseTo(timeoutTime);
            await operator.timeoutBeat(validatorSlot);

	    // the slot is now empty
	    const slot = await operator.slots(validatorSlot);
	    assert.notEqual(slot.activationEpoch.toNumber(10), 0);

	    // the challenge should have been deleted, can not timeout twice
	    await operator.timeoutBeat(validatorSlot).should.be.rejectedWith(EVMRevert);
	});

	it('Can defend invalid challenges', async () => {
	   
	    const input = new Input(new Outpoint(ZERO, 0));
	    const output = new Output(1, alice, heartbeatColor);
	    const tx = Tx.transfer([input], [output]);
	    tx.sign([alicePriv]);
	    
	    const block = new Block(65);
            block.addTx(tx);
            const prevPeriodRoot = await bridge.tipHash();
            const period = new Period(prevPeriodRoot, [block]);
	    period.setValidatorData(0, alice, CAS);
            const proof = period.proof(tx);

	    await operator.submitPeriodWithCas(0, prevPeriodRoot, period.merkleRoot(), CAS, { from: alice }).should.be.fulfilled;

	    // validator has just submitted period with their hearbeat
	    // now they get wrongly challenged
	    await operator.challengeBeat(validatorSlot, {value: CHALLENGE_STAKE});

	    const walkProof = [proof[0]];
	    // challenge proof
	    await operator.respondBeat(proof, walkProof, 0);

	    const timeoutTime = (await time.latest()) + CHALLENGE_DURATION;
            await time.increaseTo(timeoutTime);

	    // challnge was defended
	    await operator.timeoutBeat(validatorSlot).should.be.rejectedWith(EVMRevert);
	    
	});
    });
  });


});
