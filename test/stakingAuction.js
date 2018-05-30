import utils from 'ethereumjs-util';
import EVMRevert from './helpers/EVMRevert';
import { Period, Block, Tx, Input, Output, Outpoint } from 'parsec-lib';
import assertRevert from './helpers/assertRevert';
import chai from 'chai';
const StakingAuction = artifacts.require('./StakingAuction.sol');
const SimpleToken = artifacts.require('SimpleToken');

const should = chai
  .use(require('chai-as-promised'))
  .should();

const empty = '0x0000000000000000000000000000000000000000000000000000000000000000';

contract('StakingAuction', (accounts) => {
  const alice = accounts[0];
  const alicePriv = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';
  const bob = accounts[1];
  const bobPriv = '0x7bc8feb5e1ce2927480de19d8bc1dc6874678c016ae53a2eec6a6e9df717bfac';
  const charlie = accounts[2];
  const charliePriv = '0x94890218f2b0d04296f30aeafd13655eba4c5bbf1770273276fee52cbe3f2cb4';

  let auction;
  let token;
  let totalSupply;
  const p = [];

  before(async () => {
    token = await SimpleToken.new();
    // initialize contract
    auction = await StakingAuction.new(token.address, 3, 50);
    p[0] = await auction.tipHash();
    totalSupply = await token.totalSupply();
    token.transfer(bob, totalSupply.div(3));
    token.transfer(charlie, totalSupply.div(3));
  });

  it('should prevent submission by unbonded validators', async () => {
    await auction.submitPeriod(0, p[0], empty, {from: alice}).should.be.rejectedWith(EVMRevert);
  });

  it('should allow to buy slot and submit block', async () => {
    await token.approve(auction.address, totalSupply, {from: alice});
    await auction.bet(0, 100, alice, {from: alice}).should.be.fulfilled;
    await auction.submitPeriod(0, p[0], '0x01', {from: alice}).should.be.fulfilled;
    p[1] = await auction.tipHash();
  });

  it('should prevent auctining for lower price', async () => {
    await token.approve(auction.address, totalSupply, {from: bob});
    await auction.bet(0, 129, bob, {from: bob}).should.be.rejectedWith(EVMRevert);
    await auction.bet(0, 131, bob, {from: bob}).should.be.rejectedWith(EVMRevert);
  });

  it('should allow to be slashed',  async () => {
    await auction.slash(0, 20).should.be.fulfilled;
  });

  it('should allow to auction for higer price',  async () => {
    await auction.bet(0, 150, bob, {from: bob}).should.be.fulfilled;
  });

  it('should allow submission when slot auctioned in same epoch', async () => {
    await auction.submitPeriod(0, p[1], '0x02', {from: alice}).should.be.fulfilled;
    p[2] = await auction.tipHash();
  });

  it('should prevent submission by auctioned slot in later epoch', async () => {
    await auction.submitPeriod(0, p[2], '0x03', {from: alice}).should.be.rejectedWith(EVMRevert);
    await auction.submitPeriod(0, p[2], '0x03', {from: bob}).should.be.rejectedWith(EVMRevert);
  });

  it('allow to buy another slot', async () => {
    await token.approve(auction.address, totalSupply, {from: charlie});
    await auction.bet(1, 100, charlie, {from: charlie}).should.be.fulfilled;
  });

  it('should allow to slash doublespend', async () => {
    // create some tx spending an output
    const prevTx = '0x7777777777777777777777777777777777777777777777777777777777777777';
    const value = 99000000;
    let transfer = Tx.transfer(
      6,
      [new Input(new Outpoint(prevTx, 0))],
      [new Output(value, alice)]
    );
    transfer = transfer.sign([alicePriv]);

    // submit that tx
    let block = new Block(p[2], 4);
    block.addTx(transfer);
    block.addTx(Tx.deposit(12, value, alice));
    block.sign(alicePriv);
    let period = new Period([block]);
    await auction.submitPeriod(1, p[2], period.merkleRoot(), {from: charlie}).should.be.fulfilled;
    let tip = await auction.getTip();
    p[3] = await auction.tipHash();
    assert.equal(p[3], tip[0]);
    const prevProof = period.proof(transfer);
    prevProof[0] = period.merkleRoot();

    // submit tx spending same out in later block
    block = new Block(p[2], 5).addTx(transfer);
    block.sign(bobPriv);
    period = new Period([block]);
    await auction.submitPeriod(1, p[3], period.merkleRoot(), {from: charlie}).should.be.fulfilled;
    tip = await auction.getTip();
    assert.equal(tip[0], period.merkleRoot());
    const proof = period.proof(transfer);
    proof[0] = period.merkleRoot();

    // submit proof and get block deleted
    const bal1 = (await auction.getSlot(1))[1];
    await auction.reportDoubleSpend(proof, prevProof, {from: alice});
    tip = await auction.getTip();
    assert.equal(p[3], tip[0]);
    const bal2 = (await auction.getSlot(1))[1];
    assert(bal1.toNumber() > bal2.toNumber());
  });

  it('should allow to activate auctioned slot and submit', async () => {
    // increment Epoch
    await auction.submitPeriod(1, p[3], '0x04', {from: charlie}).should.be.fulfilled;
    p[4] = await auction.tipHash();
    await auction.submitPeriod(1, p[4], '0x05', {from: charlie}).should.be.fulfilled;
    p[5] = await auction.tipHash();
    let tip = await auction.getTip();
    assert.equal(p[5], tip[0]);
    await auction.submitPeriod(1, p[5], '0x06', {from: charlie}).should.be.fulfilled;
    p[6] = await auction.tipHash();
    // activate and submit by bob
    const bal1 = await token.balanceOf(alice);
    await auction.activate(0);
    const bal2 = await token.balanceOf(alice);
    assert.equal(bal1.add(180).toNumber(), bal2.toNumber());
    await auction.submitPeriod(0, p[6], '0x07', {from: bob}).should.be.fulfilled;
    p[7] = await auction.tipHash();
  });

  it('should allow to logout', async () => {
    await auction.bet(0, 0, bob, {from: bob}).should.be.fulfilled;
  });

  it('should prevent submission by logged-out slot in later epoch', async () => {
    // increment epoch
    await auction.submitPeriod(1, p[7], '0x08', {from: charlie}).should.be.fulfilled;
    p[8] = await auction.tipHash();
    // try to submit when logged out
    await auction.submitPeriod(0, p[8], '0x09', {from: bob}).should.be.rejectedWith(EVMRevert);
  });

  it('should allow to withdraw after logout', async () => {
    // increment epoch
    await auction.submitPeriod(1, p[8], '0x09', {from: charlie}).should.be.fulfilled;
    p[9] = await auction.tipHash();
    await auction.submitPeriod(1, p[9], '0x0a', {from: charlie}).should.be.fulfilled;
    p[10] = await auction.tipHash();
    await auction.submitPeriod(1, p[10], '0x0b', {from: charlie}).should.be.fulfilled;
    p[11] = await auction.tipHash();
    // activate logout
    token.transfer(auction.address, 2000);
    const bal1 = await token.balanceOf(bob);
    await auction.activate(0);
    const bal2 = await token.balanceOf(bob);
    assert.equal(bal1.add(200).toNumber(), bal2.toNumber());
    // we have submiteed 11 periods in total
    // epoch 1: period 0 - 2
    // epoch 2: period 3 - 5
    // epoch 3: period 6 - 8
    // epoch 4: period 9 - 11
    // => in addition to genesis period, now we should be in epoch 5
    const lastEpoch = await auction.lastCompleteEpoch();
    assert.equal(lastEpoch.toNumber(), 4);
    const height = await auction.chain(p[11]);
    // we should have 12 * 32 => 384 blocks at this time
    assert.equal(height[1].toNumber(), 384);
  });

});
