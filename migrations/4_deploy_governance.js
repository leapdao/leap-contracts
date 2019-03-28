/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

const { durationToString, duration } = require('../test/helpers/duration');
const log = require('./utils/log');

const MinGov = artifacts.require('MinGov');
const NativeToken = artifacts.require('NativeToken');
const AdminableProxy = artifacts.require('AdminableProxy');
const BridgeProxy = artifacts.require('BridgeProxy');
const OperatorProxy = artifacts.require('OperatorProxy');
const ExitHandlerProxy = artifacts.require('ExitHandlerProxy');

const DEFAULT_PROPOSAL_TIME = duration.days(14);

module.exports = (deployer, network, accounts) => {
  let estimate;
  const admin = accounts[1];
  const proposalTime = process.env.PROPOSAL_TIME || DEFAULT_PROPOSAL_TIME;
  const ownerAddr = process.env.GOV_OWNER;
  const govAddr = process.env.GOV_ADDR;
  const deployedToken = process.env.DEPLOYED_TOKEN;

  deployer.then(async () => {
    let nativeToken;
    if(deployedToken) {
      nativeToken = await NativeToken.at(deployedToken);
    } else {
      nativeToken = await NativeToken.deployed();
    }

    let governance;
    if (govAddr) {
      log('  Using existing Governance at:', govAddr);
      governance = await MinGov.at(govAddr);
    } else {
      log('  🕐 Deploying Governance with proposal time:', durationToString(proposalTime));
      estimate = 1455744; // guess
      governance = await deployer.deploy(MinGov, proposalTime, {gas: estimate});
    }

    // estimate for remaining calls
    estimate = 70000 * 2;

    const bridgeProxy = await BridgeProxy.deployed();
    log('  🔄 Transferring ownership for Bridge:', bridgeProxy.address);
    await bridgeProxy.changeAdmin(governance.address, { from: admin, gas: estimate });

    const operatorProxy = await OperatorProxy.deployed();
    log('  🔄 Transferring ownership for Operator:', operatorProxy.address);
    await operatorProxy.changeAdmin(governance.address, { from: admin, gas: estimate });
    
    const exitHandlerProxy = await ExitHandlerProxy.deployed();
    log('  🔄 Transferring ownership for ExitHandler:', exitHandlerProxy.address);
    await exitHandlerProxy.changeAdmin(governance.address, { from: admin, gas: estimate });

    const registryProxy = await AdminableProxy.deployed();
    log('  🔄 Transferring ownership for SwapRegistry:', registryProxy.address);
    await registryProxy.changeAdmin(governance.address, { from: admin, gas: estimate });

    const isMinter = await nativeToken.isMinter(accounts[0]);
    if (ownerAddr) {
      if (!govAddr) {
        log('  🔄 Transferring ownership for Governance:', ownerAddr);
        await governance.transferOwnership(ownerAddr, { gas: estimate });
      }
      if (isMinter) {
        log('  init supply.');
        const decimals = await nativeToken.decimals();
        const amount = (10**decimals.toNumber()).toString();
        await nativeToken.mint(ownerAddr, amount, { gas: estimate });
      }
    }
    
    if (isMinter) {
      log('  🔄 Transferring minting right for token:', nativeToken.address);
      await nativeToken.addMinter(governance.address, { gas: estimate });
      await nativeToken.renounceMinter({ gas: estimate });
    }

    const isRegistryMinter = await nativeToken.isMinter(registryProxy.address);
    if (!isRegistryMinter) {
      log('  ⚠ Minting rights could not be set on token:', nativeToken.address);
      log(`  ⚠ Add SwapRegistry (${registryProxy.address}) as minter manually.`);
    }
  });
};
