/**
 * Copyright (c) 2019-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

const Bridge = artifacts.require('Bridge');
const BridgeProxy = artifacts.require('BridgeProxy');

const PoaOperator = artifacts.require('PoaOperator');
const OperatorProxy = artifacts.require('OperatorProxy');

const ExitHandler = artifacts.require('FastExitHandler');
const ExitHandlerProxy = artifacts.require('ExitHandlerProxy');

const MinGov = artifacts.require('MinGov');

module.exports = (deployer) => {
  let data;

  if (!process.env.CONFIG) return;
  const config = require(process.env.CONFIG);  

  deployer.then(async () => {

    const { bridgeAddr, operatorAddr, exitHandlerAddr } = config;

    const minGovAddr = await (await Bridge.at(bridgeAddr)).admin();
    console.log(minGovAddr);
    const minGov = await MinGov.at(minGovAddr);

    const bridgeImpl = await deployer.deploy(Bridge);
    data = (await BridgeProxy.at(bridgeAddr)).contract.methods
      .upgradeTo(bridgeImpl.address).encodeABI();
    await minGov.propose(bridgeAddr, data);

    const operatorImpl = await deployer.deploy(PoaOperator);
    data = (await OperatorProxy.at(operatorAddr)).contract.methods
      .upgradeTo(operatorImpl.address).encodeABI();
    await minGov.propose(operatorAddr, data);

    const exitHandlerImpl = await deployer.deploy(ExitHandler);
    data = (await ExitHandlerProxy.at(exitHandlerAddr)).contract.methods
      .upgradeTo(exitHandlerImpl.address).encodeABI();
    await minGov.propose(exitHandlerAddr, data);

    await minGov.finalize();
  })
}
