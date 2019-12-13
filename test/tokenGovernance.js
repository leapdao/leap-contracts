import chai from 'chai';
import { Tx } from 'leap-core';
import { EVMRevert, submitNewPeriodWithTx } from './helpers';

const AdminableProxy = artifacts.require('AdminableProxy');
const NativeToken = artifacts.require('NativeToken');
const Bridge = artifacts.require('Bridge');
const Vault = artifacts.require('Vault');
const TokenGovernance = artifacts.require('TokenGovernance');

chai.use(require('chai-as-promised')).should();

contract('TokenGovernance', (accounts) => {
  let bridge;
  let vault;
  let gov;
  let leapToken;
  let proxy;
  const proposalHash = '0x1122334411223344112233441122334411223344112233441122334411223344';
  const proposalStake = '5000000000000000000000';
  const parentBlockInterval = 0;
  const alice = accounts[0];
  const bob = accounts[1];

  const submitNewPeriod = txs => submitNewPeriodWithTx(txs, bridge, { from: bob });

  before(async () => {
    leapToken = await NativeToken.new("Leap Token", "Leap", 18);
    leapToken.mint(accounts[0], proposalStake);

    const bridgeCont = await Bridge.new();
    let data = await bridgeCont.contract.methods.initialize(parentBlockInterval).encodeABI();
    proxy = await AdminableProxy.new(bridgeCont.address, data, {from: accounts[2]});
    bridge = await Bridge.at(proxy.address);

    data = await bridge.contract.methods.setOperator(bob).encodeABI();
    await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

    const vaultCont = await Vault.new();
    data = await vaultCont.contract.methods.initialize(bridge.address).encodeABI();
    proxy = await AdminableProxy.new(vaultCont.address, data,  {from: accounts[2]});
    vault = await Vault.at(proxy.address);

    // register first token
    data = await vault.contract.methods.registerToken(leapToken.address, 0).encodeABI();
    await proxy.applyProposal(data, {from: accounts[2]}).should.be.fulfilled;

    gov = await TokenGovernance.new(accounts[0], leapToken.address, vault.address);
  });


  it('should fail if funds not approved', async () => {
    // register proposal
    await gov.registerProposal(proposalHash).should.be.rejectedWith(EVMRevert);
  });

  it('should allow to create proposal', async () => {
    const amount = 34567000000;
    const depositTx = Tx.deposit(123, amount, alice);

    const period1 = await submitNewPeriod([depositTx]);
    const inputProof = period1.proof(depositTx);

    // allow gov contract to pull funds
    leapToken.approve(gov.address, proposalStake);
    // register proposal
    await gov.registerProposal(proposalHash);
    // read proposal
    let rsp = await gov.proposals(proposalHash);
    assert(rsp.openTime > 0);

    // check that same proposal can not be rigestered twice
    leapToken.mint(accounts[0], proposalStake);
    leapToken.approve(gov.address, proposalStake);
    await gov.registerProposal(proposalHash).should.be.rejectedWith(EVMRevert);

    await gov.castVote(proposalHash, inputProof, 0, true);
    rsp = await gov.proposals(proposalHash);
    assert.equal(rsp.yesVotes, amount);
  });

});
