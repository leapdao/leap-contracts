/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

/* eslint-disable no-console */

const MinGov = artifacts.require('MinGov');
const BridgeProxy = artifacts.require('BridgeProxy');
const OperatorProxy = artifacts.require('OperatorProxy');
const ExitHandlerProxy = artifacts.require('ExitHandlerProxy');

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const DEFAULT_PROPOSAL_TIME = 14 * DAY;

const formatTime = (durationSec) => {
  const days = Math.trunc(durationSec / DAY); 
  const hours = Math.trunc((durationSec - days * DAY) / HOUR); 
  const minutes = Math.trunc((durationSec - days * DAY - hours * HOUR) / MINUTE); 
  const seconds = Math.trunc(durationSec - days * DAY - hours * HOUR - minutes * MINUTE); 
  
  const duration = [];
  if (days) duration.push(`${days} days`);
  if (hours) duration.push(`${hours} hours`);
  if (minutes) duration.push(`${minutes} minutes`);
  if (seconds) duration.push(`${seconds} seconds`);

  return duration.join(', ');
};

module.exports = (deployer, network, accounts) => {
  const admin = accounts[1];

  deployer.then(async () => {
    const proposalTime = process.env.PROPOSAL_TIME || DEFAULT_PROPOSAL_TIME;

    console.log('  🕐 Deploying Governance with proposal time:', formatTime(proposalTime));
    const governance = await deployer.deploy(MinGov, proposalTime);
    
    const bridgeProxy = await BridgeProxy.deployed();
    console.log('  🔄 Transferring ownership for Bridge:', bridgeProxy.address);
    await bridgeProxy.changeAdmin(governance.address, { from: admin });

    const operatorProxy = await OperatorProxy.deployed();
    console.log('  🔄 Transferring ownership for Operator:', operatorProxy.address);
    await operatorProxy.changeAdmin(governance.address, { from: admin });
    
    const exitHandlerProxy = await ExitHandlerProxy.deployed();
    console.log('  🔄 Transferring ownership for ExitHandler:', exitHandlerProxy.address);
    await exitHandlerProxy.changeAdmin(governance.address, { from: admin });
  });
};