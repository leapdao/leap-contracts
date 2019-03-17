/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

const { durationToString, duration } = require('../test/helpers/duration');
const log = require('./utils/log');
const writeConfig = require('./utils/writeConfig');

const Bridge = artifacts.require('Bridge');
const Vault = artifacts.require('Vault');
const NativeToken = artifacts.require('NativeToken');
const PoaOperator = artifacts.require('PoaOperator');
const ExitHandler = artifacts.require('FastExitHandler');
const SwapRegistry = artifacts.require('SwapRegistry');
const PriorityQueue = artifacts.require('PriorityQueue');
const AdminableProxy = artifacts.require('AdminableProxy');
const BridgeProxy = artifacts.require('BridgeProxy');
const OperatorProxy = artifacts.require('OperatorProxy');
const ExitHandlerProxy = artifacts.require('ExitHandlerProxy');


const DEFAULT_EXIT_DURATION = duration.days(7);
const DEFAULT_EXIT_STAKE = '0x016345785D8A0000'; // 10^17
const DEFAULT_EPOCH_LENGTH = 4;
const DEFAULT_TAX_RATE = 50;  // 5%
const DEFAULT_PARENT_BLOCK_INTERVAL = 2;

module.exports = (deployer, network, accounts) => {
  const admin = accounts[1];
  let estimate;
  const exitDuration = process.env.EXIT_DURATION || DEFAULT_EXIT_DURATION;
  const exitStake = process.env.EXIT_STAKE || DEFAULT_EXIT_STAKE;
  const epochLength = process.env.EPOCH_LENGTH || DEFAULT_EPOCH_LENGTH;
  const parentBlockInterval = process.env.PARENT_BLOCK_INTERVAL || DEFAULT_PARENT_BLOCK_INTERVAL;
  const deployedToken = process.env.DEPLOYED_TOKEN;
  const taxRate = process.env.TAX_RATE || DEFAULT_TAX_RATE;
  const poaReward = process.env.POA_REWARD || 0;

  let data;

  deployer.then(async () => {
    let nativeToken;
    if(deployedToken) {
      nativeToken = await NativeToken.at(deployedToken);
      log('  ♻️  Found token in environment:', nativeToken.address);
    } else {
      nativeToken = await NativeToken.deployed();
      log('  ♻️  Reusing existing Native Token:', nativeToken.address);
    }

    estimate = 599334; // guess
    const bridgeCont = await deployer.deploy(Bridge, {gas: estimate});
    data = bridgeCont.contract.methods.initialize(parentBlockInterval).encodeABI();
    estimate = 955744; // guess
    const bridgeProxy = await deployer.deploy(BridgeProxy, bridgeCont.address, data, { from: admin, gas: estimate });

    estimate = 498356; // guess
    const pqLib = await deployer.deploy(PriorityQueue, {gas: estimate});
    ExitHandler.link('PriorityQueue', pqLib.address);

    log('  🕐 Exit duration:', durationToString(exitDuration));
    log('  💰 Exit stake:', exitStake);

    estimate = 5416917;
    const exitHandlerCont = await deployer.deploy(ExitHandler, {gas: estimate});
    data = await exitHandlerCont.contract.methods.initializeWithExit(bridgeProxy.address, exitDuration, exitStake).encodeABI();
    estimate = 955744; // guess
    const exitHandlerProxy = await deployer.deploy(ExitHandlerProxy, exitHandlerCont.address, data, { from: admin, gas: estimate});

    estimate = 959662;
    const operatorCont = await deployer.deploy(PoaOperator, {gas: estimate});
    data = await operatorCont.contract.methods.initialize(bridgeProxy.address, exitHandlerProxy.address, epochLength).encodeABI();
    estimate = 955744; // guess
    const operatorProxy = await deployer.deploy(OperatorProxy, operatorCont.address, data, { from: admin, gas: estimate });

    estimate = 1399128;
    const registryCont = await deployer.deploy(SwapRegistry, {gas: estimate});
    data = await registryCont.contract.methods.initialize(bridgeProxy.address, exitHandlerProxy.address, poaReward).encodeABI();
    estimate = 955744; // guess
    const registryProxy = await deployer.deploy(AdminableProxy, registryCont.address, data, { from: admin, gas: estimate });

    // estimate for the remaining calls
    estimate = 70000;
    const swapRegistry = await SwapRegistry.at(registryProxy.address);
    if (taxRate) {
      data = await swapRegistry.contract.methods.setTaxRate(taxRate).encodeABI();
      await bridgeProxy.applyProposal(data, { from: admin, gas: estimate });
    }

    const isMinter = await nativeToken.isMinter(accounts[0]);
    // if we got the right, then add registry as minter
    if (isMinter) {
      await nativeToken.addMinter(swapRegistry.address, { gas: estimate });
    }

    const bridge = await Bridge.at(bridgeProxy.address);
    data = await bridge.contract.methods.setOperator(operatorProxy.address).encodeABI();
    await bridgeProxy.applyProposal(data, { from: admin, gas: estimate });

    const vault = await Vault.at(exitHandlerProxy.address);
    data = await vault.contract.methods.registerToken(nativeToken.address, false).encodeABI();
    await exitHandlerProxy.applyProposal(data, { from: admin, gas: estimate });

    writeConfig({
      bridgeProxy,
      operatorProxy,
      exitHandlerProxy,
      bridge: Bridge,
      operator: PoaOperator,
      exitHandler: ExitHandler,
    }, network);

  })
}
