import chai from 'chai';

import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const AdminableProxy = artifacts.require('AdminableProxy');
const Bridge = artifacts.require('Bridge');
const DepositV50Handler = artifacts.require('DepositV50Handler');
const DepositHandler = artifacts.require('DepositHandler');
const SimpleToken = artifacts.require('SimpleToken');
const SpaceDustNFT = artifacts.require('SpaceDustNFT');
const NST = artifacts.require('ERC1948.sol');

chai.use(require('chai-as-promised')).should();

contract('DepositV50Upgrade', (accounts) => {
  const alice = accounts[0];
  const bob = accounts[1];
  let bridge;
  let depositHandler;
  let proxy;
  let nativeToken;
  const parentBlockInterval = 0;

  beforeEach(async () => {
      nativeToken = await SimpleToken.new();
      const bridgeCont = await Bridge.new();
      let data = await bridgeCont.contract.methods.initialize(parentBlockInterval).encodeABI();
      proxy = await AdminableProxy.new(bridgeCont.address, data, {from: accounts[2]});
      bridge = await Bridge.at(proxy.address);
      data = await bridge.contract.methods.setOperator(bob).encodeABI();
      await proxy.applyProposal(data, {from: accounts[2]});

      const vaultCont = await DepositV50Handler.new();
      data = await vaultCont.contract.methods.initialize(bridge.address).encodeABI();
      proxy = await AdminableProxy.new(vaultCont.address, data, {from: accounts[2]});
      depositHandler = await DepositV50Handler.at(proxy.address);

      // register first token
      data = await depositHandler.contract.methods.registerToken(nativeToken.address, false).encodeABI();
      await proxy.applyProposal(data, {from: accounts[2]});

  });

  it('should allow to upgrade deposit handler', async () => {
    await nativeToken.approve(depositHandler.address, 1000);
    const depositHandlerBalanceBefore = await nativeToken.balanceOf(depositHandler.address);

    const color = 0;
    const amount = 300;
    await depositHandler.deposit(alice, amount, color).should.be.fulfilled;

    const depositCount = await depositHandler.depositCount();
    console.log(depositCount);

    // do upgrade
    // deploy new contract
    const proxy = await AdminableProxy.at(depositHandler.address);
    const newDepositLogic = await DepositHandler.new();

    // propose and finalize upgrade
    const data = await proxy.upgradeTo(newDepositLogic.address, {from: accounts[2]});
    const newDepositHandler = await DepositHandler.at(proxy.address);

    // read again
    const depositCount2 = await newDepositHandler.depositCount();
    console.log(depositCount2);

  });
});