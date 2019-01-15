/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

const { durationToString, duration } = require('../test/helpers/duration');
const log = require('./utils/log');

const MinGov = artifacts.require('MinGov');
const BridgeProxy = artifacts.require('BridgeProxy');
const OperatorProxy = artifacts.require('OperatorProxy');
const ExitHandlerProxy = artifacts.require('ExitHandlerProxy');

const DEFAULT_PROPOSAL_TIME = duration.days(14);

module.exports = (deployer, network, accounts) => {
  const admin = accounts[1];

  deployer.then(async () => {
    const proposalTime = process.env.PROPOSAL_TIME || DEFAULT_PROPOSAL_TIME;

    log('  🕐 Deploying Governance with proposal time:', durationToString(proposalTime));
    const governance = await deployer.deploy(MinGov, proposalTime);
    
    const bridgeProxy = await BridgeProxy.deployed();
    log('  🔄 Transferring ownership for Bridge:', bridgeProxy.address);
    await bridgeProxy.changeAdmin(governance.address, { from: admin });

    const operatorProxy = await OperatorProxy.deployed();
    log('  🔄 Transferring ownership for Operator:', operatorProxy.address);
    await operatorProxy.changeAdmin(governance.address, { from: admin });
    
    const exitHandlerProxy = await ExitHandlerProxy.deployed();
    log('  🔄 Transferring ownership for ExitHandler:', exitHandlerProxy.address);
    await exitHandlerProxy.changeAdmin(governance.address, { from: admin });
  });
};