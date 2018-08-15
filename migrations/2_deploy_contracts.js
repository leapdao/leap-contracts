const fs = require('fs');

var PriorityQueue = artifacts.require("./PriorityQueue.sol");
var TxLib = artifacts.require("./TxLib.sol");
var ParsecBridge = artifacts.require("./ParsecBridge.sol");
var SimpleToken = artifacts.require("./SimpleToken.sol");

module.exports = function(deployer, network, accounts) {
  deployer.deploy(PriorityQueue);
  deployer.deploy(TxLib);
  deployer.deploy(SimpleToken);
  deployer.link(PriorityQueue, ParsecBridge);
  deployer.link(TxLib, ParsecBridge);
  deployer.deploy(ParsecBridge, 4, 50, 10, 0);

  var token, bridge;

  deployer.then(function() {
    return ParsecBridge.deployed();
  }).then(function(b) {
    bridge = b;
    return SimpleToken.deployed();
  }).then(function(t) {
    token = t;
    return token.approve(bridge.address, '1000000000000');
  }).then(function() {
    return bridge.registerToken(token.address);
  }).then(function() {
    var node_config = {
      "bridgeAddr": bridge.address,
      "network": "0",
      "rootNetwork": "http://localhost:9545",
      "peers": []
    }
    fs.writeFile("./node_config.json", JSON.stringify(node_config), 'utf8', function (err) {
        if (err) {
            return console.log(err);
        }
    });
  });
};