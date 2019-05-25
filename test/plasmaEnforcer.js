import { Tx, Input, Output, Outpoint } from 'leap-core';
import { submitNewPeriodWithTx } from './helpers';

const ethUtil = require('ethereumjs-util');
require('./helpers/setup');

const { BN } = web3.utils;
const PlasmaEnforcer = artifacts.require('./PlasmaEnforcer.sol');
const VerifierMock = artifacts.require('./VerifierMock.sol');
const AdminableProxy = artifacts.require('./AdminableProxy.sol');
const Bridge = artifacts.require('./Bridge.sol');

contract('PlasmaEnforcer', (accounts) => {
  const alice = accounts[0];
  const alicePriv = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';
  const bob = accounts[1];
  const challengePeriod = 30;
  const timeoutDuration = 2;
  const maxExecutionDepth = 10;
  let enforcer;
  let verifier;
  let proxy;
  let bridge;
  const parentBlockInterval = 0;
  let depositTx;
  let transferTx;
  const depositId = 1;
  const depositAmount = new BN(100);
  const bondAmount = 999;

  const submitNewPeriod = txs => submitNewPeriodWithTx(txs, bridge, { from: bob });

  before('Prepare contracts', async () => {
    const bridgeCont = await Bridge.new();
    let data = await bridgeCont.contract.methods.initialize(parentBlockInterval).encodeABI();
    proxy = await AdminableProxy.new(bridgeCont.address, data, {from: accounts[2]});
    bridge = await Bridge.at(proxy.address);
    data = await bridge.contract.methods.setOperator(accounts[1]).encodeABI();
    await proxy.applyProposal(data, {from: accounts[2]});



    verifier = await VerifierMock.new(timeoutDuration);
    enforcer = await PlasmaEnforcer.new(verifier.address, challengePeriod, bondAmount, maxExecutionDepth, bridge.address);

    await verifier.setEnforcer(enforcer.address);

    depositTx = Tx.deposit(depositId, depositAmount.toNumber(), alice);
    transferTx = Tx.transfer(
      [new Input(new Outpoint(depositTx.hash(), 0))],
      [new Output(50, bob), new Output(50, alice)]
    ).sign([alicePriv]);
  });

  it('Should allow to challenge exit by whitelisted tx', async () => {
    const conditionScript = Buffer.from('11223344', 'hex');
    const scriptHash = ethUtil.ripemd160(conditionScript);

    transferTx = Tx.transfer(
      [new Input(new Outpoint(depositTx.hash(), 0))],
      [new Output(50, alice), new Output(50, alice)]
    ).sign([alicePriv]);
    const spendTx = Tx.transfer(
      [new Input(new Outpoint(transferTx.hash(), 1))],
      [new Output(25, `0x${scriptHash.toString('hex')}`), new Output(25, alice)]
    ).sign([alicePriv]);

    


    const spendCondTx = Tx.spendCond(
      [
        new Input({ // gas input
          prevout: new Outpoint(transferTx.hash(), 0),
          script: conditionScript,
        }),
        new Input({ // payload inputs
          prevout: new Outpoint(spendTx.hash(), 1),
        }),
      ],
      [
        new Output(25, alice, 0), // playload output
        new Output(45, `0x${scriptHash.toString('hex')}`, 0), // gas change output
      ]
    );
    spendCondTx.inputs[0].setMsgData('0xd01a81e1');

    const period = await submitNewPeriod([depositTx, transferTx, spendTx, spendCondTx]);

    const transferProof = period.proof(transferTx);
    const spendProof = period.proof(spendTx);
    const condProof = period.proof(spendCondTx);

    // withdraw output
    // await exitHandler.startExit(transferProof, spendProof, 1, 0, { from: alice });
    await enforcer.startWhitelisting(transferProof, 0, '0x', {value: bondAmount});
    await enforcer.startWhitelisting(spendProof, 1, '0x', {value: bondAmount});

    const execDepth = 10;
    const rootHash = transferTx.hash();
    await enforcer.startWhitelisting(condProof, execDepth, rootHash, {value: bondAmount});

    // const startTime = await time.latest();
    // let exitTime = startTime + time.duration.seconds(exitDuration);
    // await time.increaseTo(exitTime);
    
    // await exitHandler.challengeExit(condProof, spendProof, 1, 1);
    
    // const bal1 = await nativeToken.balanceOf(alice);

    // exitTime = startTime + time.duration.seconds(exitDuration * 2);
    // await time.increaseTo(exitTime);

    // await exitHandler.finalizeTopExit(0);
    
    // const bal2 = await nativeToken.balanceOf(alice);
    // // check transfer didn't happen
    // assert.equal(bal1.toNumber(), bal2.toNumber());
    // // check exit was evicted from PriorityQueue
    // assert.equal((await exitHandler.tokens(0))[1], 0);

    // TODO: integrate with exitHandler.

  });

});