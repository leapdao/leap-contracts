const fs = require('fs');
const truffleConfig = require('../truffle.js');

const Bridge = artifacts.require('Bridge');
const MintableToken = artifacts.require('MockMintableToken');
const POSoperator = artifacts.require('POSoperator');
const FastExitHandler = artifacts.require('FastExitHandler');
const PriorityQueue = artifacts.require('PriorityQueue');

function abiFileString(abi) {
  return 'module.exports = ' + JSON.stringify(abi);
}

function writeAbi(name, abi) {
  fs.writeFile("./build/nodeFiles/" + name + ".js", abiFileString(abi), function(err) {
    if(err) {
      return console.log(err);
    }
  });
}

function writeConfig(bridgeAddr, operatorAddr, exitHandlerAddr, network) {
  const networkData = truffleConfig.networks[network];
  const rootNetwork = 'http://' + networkData.host + ':' + networkData.port;
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
  fs.writeFile("./build/nodeFiles/generatedConfig.json", JSON.stringify(config), function(err) {
    if(err) {
      return console.log(err);
    }
  });
}

module.exports = function(deployer, network, accounts) {
  const maxReward = 50;
  const parentBlockInterval = 0;
  const epochLength = 3;
  const exitDuration = 0;
  const exitStake = 0;
  let bridge, nativeToken, operator, pqLib, exitHandler;

  deployer.then(function() {
    return MintableToken.new();
  }).then(function(nt) {
    nativeToken = nt;
    return Bridge.new(parentBlockInterval, maxReward, nativeToken.address);
  }).then(function(br) {
    bridge = br;
    return POSoperator.new(bridge.address, epochLength);
  }).then(function(op) {
    operator = op;
    return PriorityQueue.new();
  }).then(function(pq) {
    pqLib = pq;
    return FastExitHandler.link('PriorityQueue', pqLib.address);
  }).then(function() {
    return FastExitHandler.new(bridge.address, exitDuration, exitStake);
  }).then(function(eh) {
    exitHandler = eh;
    return bridge.setOperator(operator.address);
  }).then(function() {
    console.log('Bridge: ', bridge.address);
    console.log('Operator: ', operator.address);
    console.log('ExitHandler: ', exitHandler.address);
    console.log('Token: ', nativeToken.address);
    
    try {
      fs.mkdirSync('./build/nodeFiles');
    } catch {}

    writeAbi('bridgeAbi', Bridge.abi);
    writeAbi('exitHandler', FastExitHandler.abi);
    writeAbi('operator', POSoperator.abi);

    writeConfig(bridge.address, operator.address, exitHandler.address, network);

    console.log("Generated node files in /build/nodeFiles");
  });
}