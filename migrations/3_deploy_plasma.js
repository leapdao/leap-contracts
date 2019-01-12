const fs = require('fs');
const truffleConfig = require('../truffle-config.js');
const { durationToString, duration } = require('../test/helpers/duration');
const { log } = require('../test/helpers/');

const Bridge = artifacts.require('Bridge');
const Vault = artifacts.require('Vault');
const LeapToken = artifacts.require('LeapToken');
const PoaOperator = artifacts.require('PoaOperator');
const ExitHandler = artifacts.require('ExitHandler');
const PriorityQueue = artifacts.require('PriorityQueue');
const BridgeProxy = artifacts.require('BridgeProxy');
const OperatorProxy = artifacts.require('OperatorProxy');
const ExitHandlerProxy = artifacts.require('ExitHandlerProxy');

const logError = err => { if (err) { log(err); } }

function abiFileString(abi) {
  return `module.exports = ${JSON.stringify(abi)}`;
}

function writeAbi(name, abi) {
  fs.writeFile(`./build/nodeFiles/${name}.js`, abiFileString(abi), logError);
}

function writeConfig(bridgeAddr, operatorAddr, exitHandlerAddr, network) {
  const networkData = truffleConfig.networks[network];
  const rootNetwork = `http://${networkData.host}:${networkData.port}`;
  const networkId = Math.floor(Math.random() * Math.floor(1000000000));
  const config = {
    "bridgeAddr": bridgeAddr,
    "operatorAddr": operatorAddr,
    "exitHandlerAddr": exitHandlerAddr,
    "rootNetwork": rootNetwork,
    "network": network,
    "networkId": networkId,
    "peers": []
  }
  fs.writeFile("./build/nodeFiles/generatedConfig.json", JSON.stringify(config), logError);
}

const DEFAULT_EXIT_DURATION = duration.days(14);
const DEFAULT_EXIT_STAKE = 0;
const DEFAULT_EPOCH_LENGTH = 32;
const DEFAULT_PARENT_BLOCK_INTERVAL = 0;

module.exports = (deployer, network, accounts) => {
  const admin = accounts[1];

  const exitDuration = process.env.EXIT_DURATION || DEFAULT_EXIT_DURATION;
  const exitStake = process.env.EXIT_STAKE || DEFAULT_EXIT_STAKE;

  let data;

  deployer.then(async () => {
    const leapToken = await LeapToken.deployed();
    log('  ♻️  Reusing existing Leap Token:', leapToken.address);

    const bridgeCont = await deployer.deploy(Bridge);
    data = bridgeCont.contract.methods.initialize(DEFAULT_PARENT_BLOCK_INTERVAL).encodeABI();
    const bridgeProxy = await deployer.deploy(BridgeProxy, bridgeCont.address, data, { from: admin });

    const pqLib = await deployer.deploy(PriorityQueue);
    ExitHandler.link('PriorityQueue', pqLib.address);

    log('  🕐 Exit duration:', durationToString(exitDuration));
    log('  💰 Exit stake:', exitStake);

    const exitHandlerCont = await deployer.deploy(ExitHandler);
    data = await exitHandlerCont.contract.methods.initializeWithExit(bridgeProxy.address, exitDuration, exitStake).encodeABI();
    const exitHandlerProxy = await deployer.deploy(ExitHandlerProxy, exitHandlerCont.address, data, { from: admin });

    const operatorCont = await deployer.deploy(PoaOperator);
    data = await operatorCont.contract.methods.initialize(bridgeProxy.address, DEFAULT_EPOCH_LENGTH).encodeABI();
    const operatorProxy = await deployer.deploy(OperatorProxy, operatorCont.address, data, { from: admin });

    const bridge = await Bridge.at(bridgeProxy.address);
    data = await bridgeCont.contract.methods.setOperator(operatorProxy.address).encodeABI();
    await bridgeProxy.applyProposal(data, {from: admin});

    const vault = await Vault.at(exitHandlerProxy.address);
    data = await vault.contract.methods.registerToken(leapToken.address, false).encodeABI();
    await exitHandlerProxy.applyProposal(data, {from: admin});

    try {
      fs.mkdirSync('./build/nodeFiles');
    } catch(error) {
      // we don;t care
    }

    writeAbi('bridgeAbi', Bridge.abi);
    writeAbi('exitHandler', ExitHandler.abi);
    writeAbi('operator', PoaOperator.abi);

    writeConfig(bridgeProxy.address, operatorProxy.address, exitHandlerProxy.address, network);

    log("Generated node files in /build/nodeFiles");
  })
}