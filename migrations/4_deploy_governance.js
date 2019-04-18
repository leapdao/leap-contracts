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
const SimpleToken = artifacts.require('SimpleToken');
const SpaceDustNFT = artifacts.require('SpaceDustNFT');
const AdminableProxy = artifacts.require('AdminableProxy');
const BridgeProxy = artifacts.require('BridgeProxy');
const OperatorProxy = artifacts.require('OperatorProxy');
const ExitHandlerProxy = artifacts.require('ExitHandlerProxy');

const DEFAULT_PROPOSAL_TIME = duration.days(14);

module.exports = (deployer, network, accounts) => {
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
      governance = await deployer.deploy(MinGov, proposalTime);
    }

    const bridgeProxy = await BridgeProxy.deployed();
    log('  🔄 Transferring ownership for Bridge:', bridgeProxy.address);
    await bridgeProxy.changeAdmin(governance.address, { from: admin });

    const operatorProxy = await OperatorProxy.deployed();
    log('  🔄 Transferring ownership for Operator:', operatorProxy.address);
    await operatorProxy.changeAdmin(governance.address, { from: admin });
    
    const exitHandlerProxy = await ExitHandlerProxy.deployed();
    log('  🔄 Transferring ownership for ExitHandler:', exitHandlerProxy.address);
    await exitHandlerProxy.changeAdmin(governance.address, { from: admin });

    const registryProxy = await AdminableProxy.deployed();
    log('  🔄 Transferring ownership for SwapRegistry:', registryProxy.address);
    await registryProxy.changeAdmin(governance.address, { from: admin });

    const { SEED_ACCOUNT } = process.env;

    if (SEED_ACCOUNT && network === 'development') {
      const decimals = await nativeToken.decimals();
      const amount = (100 * 10**decimals.toNumber()).toString();
      
      // mint some LEAPs
      await nativeToken.mint(SEED_ACCOUNT, amount);

      // get some localnet ETH
      await web3.eth.sendTransaction({ 
        to: SEED_ACCOUNT, from: admin, value: web3.utils.toWei('10', 'ether'),
      });

      // mint another ERC20 token
      const simple = await deployer.deploy(SimpleToken);
      await simple.transfer(SEED_ACCOUNT, '1000000000000');

      // mint some NFTs
      const nft = await deployer.deploy(SpaceDustNFT);
      await nft.mint(SEED_ACCOUNT, 14, false, 3);
      await nft.mint(SEED_ACCOUNT, 13, false, 2);
      await nft.mint(SEED_ACCOUNT, 12, true, 6);
      await nft.mint(SEED_ACCOUNT, 11, false, 1);
    }

    const isMinter = await nativeToken.isMinter(accounts[0]);
    if (ownerAddr) {
      if (!govAddr) {
        log('  🔄 Transferring ownership for Governance:', ownerAddr);
        await governance.transferOwnership(ownerAddr);
      }
      if (isMinter) {
        log('  init supply.');
        const decimals = await nativeToken.decimals();
        const amount = (10**decimals.toNumber()).toString();
        await nativeToken.mint(ownerAddr, amount);
      }
    }
    
    if (isMinter && network !== 'development') {
      log('  🔄 Transferring minting right for token:', nativeToken.address);
      await nativeToken.addMinter(governance.address);
      await nativeToken.renounceMinter();
    }

    const isRegistryMinter = await nativeToken.isMinter(registryProxy.address);
    if (!isRegistryMinter) {
      log('  ⚠ Minting rights could not be set on token:', nativeToken.address);
      log(`  ⚠ Add SwapRegistry (${registryProxy.address}) as minter manually.`);
    }
  });
};
