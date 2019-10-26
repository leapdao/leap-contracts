import chai from 'chai';

const time = require('./helpers/time');

const Bridge = artifacts.require('BridgeMock');
const Operator = artifacts.require('OperatorMock');
const Vault = artifacts.require('VaultMock');
const AdminableProxy = artifacts.require('AdminableProxy');
const NativeToken = artifacts.require('NativeToken');
const MinGov = artifacts.require('MinGov');

chai.use(require('chai-as-promised')).should();

contract('MinGov', (accounts) => {

  let bridge;
  let bridgeProxy;
  let gov;

  beforeEach(async () => {
    gov = await MinGov.new(0);
    // bridge
    const bridgeLogic = await Bridge.new();
    bridgeProxy = await AdminableProxy.new(bridgeLogic.address, '0x');
    bridge = await Bridge.at(bridgeProxy.address);
    await bridgeProxy.changeAdmin(gov.address);
  });

  it('should allow to read admin as not-admin', async () => {
    const admin = await bridgeProxy.admin.call({ from: accounts[1] });
    assert.equal(admin, gov.address);
  });

  it('should allow to propose and finalize one operation', async () => {
    // check value before
    let operator = await bridge.operator();
    assert.equal(operator, '0x0000000000000000000000000000000000000000');
    // propose and finalize value change
    const data = await bridge.contract.methods.setOperator(accounts[1]).encodeABI();
    await gov.propose(bridge.address, data);
    await gov.finalize();

    // check value after
    operator = await bridge.operator();
    assert.equal(operator, accounts[1]);
  });

  it('should allow to propose and finalize multiple operations', async () => {
    // operator
    const operatorLogic = await Operator.new();
    const proxyOp = await AdminableProxy.new(operatorLogic.address, '0x');
    // await proxyOp.initialize(operatorLogic.address);
    const operator = await Operator.at(proxyOp.address);
    await proxyOp.changeAdmin(gov.address);

    // propose and finalize value changes
    const data1 = await operator.contract.methods.setMinGasPrice(200).encodeABI();
    await gov.propose(operator.address, data1);
    const data2 = await operator.contract.methods.setEpochLength(32, false).encodeABI();
    await gov.propose(operator.address, data2);
    let size = await gov.size();
    let first = await gov.first();
    assert.equal(size.toNumber(), 2);
    await gov.finalize();

    // check values after
    const minGasPrice = await operator.minGasPrice();
    assert.equal(minGasPrice.toNumber(), 200);
    const epochLength = await operator.epochLength();
    assert.equal(epochLength.toNumber(), 32);

    // propose and finalize value changes
    const data3 = await operator.contract.methods.setParentBlockInterval(300).encodeABI();
    await gov.propose(operator.address, data3);
    first = await gov.first();
    // position 1 and 2 have been used in first finalize
    assert.equal(first.toNumber(), 3);
    size = await gov.size();
    assert.equal(size.toNumber(), 1);
    await gov.finalize();

    // check values after
    const parentBlockInterval = await operator.parentBlockInterval();
    assert.equal(parentBlockInterval.toNumber(), 300);
    first = await gov.first();
    size = await gov.size();
    // position 3 in second finalize
    assert.equal(first.toNumber(), 4);
    // nothing in the pipe
    assert.equal(size.toNumber(), 0);
  });


  it('should allow to finalize same operation multiple times', async () => {
    // vault
    const vaultLogic = await Vault.new();
    const proxyVa = await AdminableProxy.new(vaultLogic.address, '0x');
    // await proxyVa.initialize(vaultLogic.address);
    const vault = await Vault.at(proxyVa.address);
    await proxyVa.changeAdmin(gov.address);

    // propose and finalize value change
    const data = await vault.contract.methods.registerToken(accounts[1], 0).encodeABI();
    await gov.propose(vault.address, data);
    await gov.finalize();

    // check value after
    let count = await vault.tokenCount();
    assert.equal(count, 1);

    // propose and finalize value change
    const data2 = await vault.contract.methods.registerToken(accounts[2], 0).encodeABI();
    await gov.propose(vault.address, data2);
    await gov.finalize();

    // check value after
    count = await vault.tokenCount();
    assert.equal(count, 2);

    const first = await gov.first();
    const size = await gov.size();
    // position 3 in second finalize
    assert.equal(first.toNumber(), 3);
    // nothing in the pipe
    assert.equal(size.toNumber(), 0);
  });

  it('should allow to upgrade bridge', async () => {
    const someVal = 1234;
    // set storage befor upgrade
    await bridge.setValue(someVal);
    // deploy new contract
    const proxy = await AdminableProxy.at(bridge.address);
    const newBridgeLogic = await Bridge.new();

    // propose and finalize upgrade
    const data = await proxy.contract.methods.upgradeTo(newBridgeLogic.address).encodeABI();
    await gov.propose(bridge.address, data);
    await gov.finalize();
    const newBridge = await Bridge.at(proxy.address);

    // check value after
    const imp = '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3';
    const logicAddr = await web3.eth.getStorageAt(proxy.address, imp);
    assert.equal(logicAddr.toLowerCase(), newBridgeLogic.address.toLowerCase());
    // check storage still matches
    const val = await newBridge.value();
    assert.equal(someVal, val.toNumber());
  });

  it('should allow to transfer into new governance', async () => {

    // propose and finalize upgrade
    const data = await bridgeProxy.contract.methods.changeAdmin(accounts[1]).encodeABI();
    await gov.propose(bridge.address, data);
    await gov.finalize();

    // check value after
    const ownerAddr = await bridge.admin();
    assert.equal(ownerAddr, accounts[1]);
  });

  it('should hold proposal for some time', async () => {
    await time.advanceBlock();

    const openingTime = await time.latest();
    const afterClosingTime = openingTime + time.duration.weeks(2) + time.duration.seconds(1);


    gov = await MinGov.new(time.duration.weeks(2));
    // bridge
    const bridgeLogic = await Bridge.new();
    const proxy = await AdminableProxy.new(bridgeLogic.address, '0x');
    // await proxy.initialize(bridgeLogic.address);
    bridge = await Bridge.at(proxy.address);
    await proxy.changeAdmin(gov.address);

    // check value before
    let operator = await bridge.operator();
    assert.equal(operator, '0x0000000000000000000000000000000000000000');
    // propose and finalize value change
    const data = await bridge.contract.methods.setOperator(accounts[1]).encodeABI();
    await gov.propose(bridge.address, data);

    // try before time passed
    await gov.finalize();
    operator = await bridge.operator();
    assert.equal(operator, '0x0000000000000000000000000000000000000000');

    // wait and try again
    await time.increaseTo(afterClosingTime);
    await gov.finalize();

    // check value after
    operator = await bridge.operator();
    assert.equal(operator, accounts[1]);
  });

  it('should allow to cancel proposal', async () => {
    // check value before
    let operator = await bridge.operator();
    assert.equal(operator, '0x0000000000000000000000000000000000000000');
    // propose and finalize value change
    const data = await bridge.contract.methods.setOperator(accounts[1]).encodeABI();
    await gov.propose(bridge.address, data);
    await gov.cancel(1);
    await gov.finalize();

    // check value after
    operator = await bridge.operator();
    assert.equal(operator, '0x0000000000000000000000000000000000000000');
  })

  it('should allow to mint token', async () => {
    const token = await NativeToken.new("Token", "TOK", 18);
    await token.addMinter(gov.address);
    // propose and finalize value change
    const data = await token.contract.methods.addMinter(accounts[1]).encodeABI();
    await gov.propose(token.address, data);
    await gov.finalize();

    // test minting rights
    await token.mint(accounts[1], 100000, { from: accounts[1] });
    const bal = await token.balanceOf(accounts[1]);
    assert.equal(bal.toNumber(), 100000);
  })

  it('should allow to proxy SetSlot without goverance delay', async () => {
    const operatorLogic = await Operator.new();
    const proxyOp = await AdminableProxy.new(operatorLogic.address, '0x');
    const operator = await Operator.at(proxyOp.address);
    await proxyOp.changeAdmin(gov.address);

    const overloadedSlot = `${proxyOp.address  }0000000000000000000000fe`;
    await gov.setSlot(overloadedSlot, accounts[0], accounts[1]);

    const slotId = await operator.slotId();
    assert.equal(slotId.toNumber(), 254);
  })

  it('should allow to register Token without goverance delay', async () => {
    const vaultLogic = await Vault.new();
    const proxyOp = await AdminableProxy.new(vaultLogic.address, '0x');
    const vault = await Vault.at(proxyOp.address);
    await proxyOp.changeAdmin(gov.address);

    await gov.registerToken(proxyOp.address, accounts[1], 0);

    let tokenCount = await vault.tokenCount();
    assert.equal(tokenCount.toNumber(), 1);

    await gov.registerToken(proxyOp.address, accounts[1], 1);

    tokenCount = await vault.tokenCount();
    assert.equal(tokenCount.toNumber(), 2);

    await gov.registerToken(proxyOp.address, accounts[1], 2);

    tokenCount = await vault.tokenCount();
    assert.equal(tokenCount.toNumber(), 3);
  })

});
