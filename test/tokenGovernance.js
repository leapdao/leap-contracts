import chai from 'chai';
import { Tx, Input, Output, Outpoint } from 'leap-core';
import { EVMRevert, submitNewPeriodWithTx } from './helpers';

const time = require('./helpers/time');
require('./helpers/setup');

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
  const totalSupply = '20000000000000000000000';
  const parentBlockInterval = 0;
  const alice = accounts[0];
  const alicePriv = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';
  const bob = accounts[1];
  const mvgAddress = accounts[2];
  const voiceAmount = 34567000000;

  const submitNewPeriod = txs => submitNewPeriodWithTx(txs, bridge, { from: bob });

  before(async () => {
    leapToken = await NativeToken.new("Leap Token", "Leap", 18);
    leapToken.mint(accounts[0], totalSupply);

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

    gov = await TokenGovernance.new(mvgAddress, leapToken.address, vault.address);
  });


  it('should fail if funds not approved', async () => {
    // register proposal
    await gov.registerProposal(proposalHash).should.be.rejectedWith(EVMRevert);
  });

  it('should allow to create, vote and finalize proposal', async () => {
    
    const depositTx = Tx.deposit(123, voiceAmount, alice);

    const period1 = await submitNewPeriod([depositTx]);
    const inputProof = period1.proof(depositTx);

    // allow gov contract to pull funds
    leapToken.approve(gov.address, proposalStake);
    const balBefore = await leapToken.balanceOf(alice);
    // register proposal
    await gov.registerProposal(proposalHash);
    let bal = await leapToken.balanceOf(gov.address);
    assert.equal(bal, proposalStake);
    // read proposal
    let rsp = await gov.proposals(proposalHash);
    assert(rsp.openTime > 0);

    // check that same proposal can not be registered twice
    leapToken.approve(gov.address, proposalStake);
    await gov.registerProposal(proposalHash).should.be.rejectedWith(EVMRevert);

    // cast vote
    await gov.castVote(proposalHash, inputProof, 0, false);
    rsp = await gov.proposals(proposalHash);
    assert.equal(rsp.noVotes, voiceAmount);

    // recast vote
    await gov.castVote(proposalHash, inputProof, 0, true);
    rsp = await gov.proposals(proposalHash);
    assert.equal(rsp.yesVotes, voiceAmount);
    assert.equal(rsp.noVotes, 0);

    // finalize and count
    await gov.finalizeProposal(proposalHash);
    rsp = await gov.proposals(proposalHash);
    assert.equal(rsp.yesVotes, voiceAmount);
    assert.equal(rsp.noVotes, 0);
    assert.equal(rsp.finalized, true);
    // token governance should have returned the stake
    bal = await leapToken.balanceOf(gov.address);
    assert.equal(bal, 0);
    // alice should have same amount like before opening the vote
    bal = await leapToken.balanceOf(alice);
    assert.equal(bal.toString(), balBefore.toString());

    // try sending vote to finalized proposal
    await gov.castVote(proposalHash, inputProof, 0, false).should.be.rejectedWith(EVMRevert);
    // try to re-open same vote
    await gov.registerProposal(proposalHash).should.be.rejectedWith(EVMRevert);
  });

  it('should allow to fail proposal', async () => {
    const anotherProposalHash = '0x6677889966778899667788996677889966778899667788996677889966778899';
    const transferTx = Tx.transfer(
      [new Input(new Outpoint(anotherProposalHash, 0))],
      [new Output(voiceAmount, alice)]
    ).sign([alicePriv]);

    const period1 = await submitNewPeriod([transferTx]);
    const inputProof = period1.proof(transferTx);

    // allow gov contract to pull funds
    leapToken.approve(gov.address, proposalStake);
    // register proposal
    await gov.registerProposal(anotherProposalHash);
    let bal = await leapToken.balanceOf(gov.address);
    assert.equal(bal, proposalStake);

    // cast vote
    await gov.castVote(anotherProposalHash, inputProof, 0, false);
    let rsp = await gov.proposals(anotherProposalHash);
    assert.equal(rsp.noVotes, voiceAmount);

    // finalize and count
    await gov.finalizeProposal(anotherProposalHash);
    rsp = await gov.proposals(anotherProposalHash);
    assert.equal(rsp.noVotes, voiceAmount);
    assert.equal(rsp.finalized, true);

    // token governance should have returned the stake
    bal = await leapToken.balanceOf(gov.address);
    assert.equal(bal, 0);
    // stake should now be in minimalViableGovernance, as vote resulted in NO
    bal = await leapToken.balanceOf(mvgAddress);
    assert.equal(bal.toString(), proposalStake);
  });

  it('should prevent vote with younger UTXO', async () => {
    const anotherProposalHash = '0x5500aabb5500aabb5500aabb5500aabb5500aabb5500aabb5500aabb5500aabb';

    // allow gov contract to pull funds
    leapToken.approve(gov.address, proposalStake);
    // register proposal
    await gov.registerProposal(anotherProposalHash);
    let bal = await leapToken.balanceOf(gov.address);
    assert.equal(bal, proposalStake);

    // increase time
    await time.increaseTo((await time.latest()) + 1);
    // create utxo after vote start time
    const transferTx = Tx.transfer(
      [new Input(new Outpoint(anotherProposalHash, 0))],
      [new Output(voiceAmount, alice)]
    ).sign([alicePriv]);
    // submit period
    const period1 = await submitNewPeriod([transferTx]);
    const inputProof = period1.proof(transferTx);

    // try to cast vote
    await gov.castVote(anotherProposalHash, inputProof, 0, true).should.be.rejectedWith(EVMRevert);
  });

  it('should allow challenge UTXO', async () => {
    const anotherProposalHash = '0xccddeeffccddeeffccddeeffccddeeffccddeeffccddeeffccddeeffccddeeff';
    // prepare 2 transactions
    const depositTx = Tx.deposit(123, voiceAmount, alice);
    const transferTx = Tx.transfer(
      [new Input(new Outpoint(depositTx.hash(), 0))],
      [new Output(voiceAmount, bob)]
    ).sign([alicePriv]);
    // submit and create proofs
    const period1 = await submitNewPeriod([depositTx, transferTx]);
    const inputProofA = period1.proof(depositTx);
    const inputProofB = period1.proof(transferTx);

    // allow gov contract to pull funds
    leapToken.approve(gov.address, proposalStake);
    // register proposal
    await gov.registerProposal(anotherProposalHash);

    // cast vote with spent UTXO
    await gov.castVote(anotherProposalHash, inputProofA, 0, true);
    let rsp = await gov.proposals(anotherProposalHash);
    assert.equal(rsp.yesVotes, voiceAmount);

    // challenge vote
    await gov.challengeUTXO(anotherProposalHash, inputProofB, 0);

    // check that vote got reverted
    rsp = await gov.proposals(anotherProposalHash);
    assert.equal(rsp.yesVotes, 0);
  });

});
