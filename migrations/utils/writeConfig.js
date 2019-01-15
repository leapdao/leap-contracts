const fs = require('fs');

const log = require('./log');
const truffleConfig = require('../../truffle-config.js');

const logError = err => { if (err) { log(err); } }

function abiFileString(abi) {
  return `module.exports = ${JSON.stringify(abi, null, 2)}`;
}

function writeAbi(name, abi) {
  fs.writeFile(`./build/nodeFiles/${name}.js`, abiFileString(abi), logError);
}

function writeConfig({ bridgeProxy, operatorProxy, exitHandlerProxy }, network) {
  const networkData = truffleConfig.networks[network];
  const rootNetwork = `http://${networkData.host}:${networkData.port}`;
  const networkId = Math.floor(Math.random() * Math.floor(1000000000));
  const config = {
    "bridgeAddr": bridgeProxy.address,
    "operatorAddr": operatorProxy.address,
    "exitHandlerAddr": exitHandlerProxy.address,
    "rootNetwork": rootNetwork,
    "network": network,
    "networkId": networkId,
    "peers": []
  }
  fs.writeFile(
    "./build/nodeFiles/generatedConfig.json",
    JSON.stringify(config, null, 2),
    logError
  );
}

module.exports = (contracts, network) => {
  try {
    fs.mkdirSync('./build/nodeFiles');
  } catch(error) {
    // we don't care
  }

  writeAbi('bridgeAbi', contracts.bridge.abi);
  writeAbi('exitHandler', contracts.exitHandler.abi);
  writeAbi('operator', contracts.operator.abi);

  writeConfig(contracts, network);

  log("Generated node files in /build/nodeFiles");
}