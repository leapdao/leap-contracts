import utils from 'ethereumjs-util';
import EVMRevert from './helpers/EVMRevert';
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
  const bob = accounts[1];
  const charlie = accounts[2];
  let auction;
  let token;
  let totalSupply;
  const p = [];

  before(async () => {
    token = await SimpleToken.new();
    // initialize contract
    auction = await StakingAuction.new(token.address, 3);
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
    await auction.bet(0, 99, bob, {from: bob}).should.be.rejectedWith(EVMRevert);
    await auction.bet(0, 101, bob, {from: bob}).should.be.rejectedWith(EVMRevert);
  });

  it('should allow to be slashed',  async () => {
    await auction.slash(0, 20).should.be.fulfilled;
  });

  it('should allow to auction for higer price',  async () => {
    await auction.bet(0, 120, bob, {from: bob}).should.be.fulfilled;
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

  it('should allow to activate auctioned slot and submit', async () => {
    // increment Epoch
    await auction.submitPeriod(1, p[2], '0x03', {from: charlie}).should.be.fulfilled;
    p[3] = await auction.tipHash();
    await auction.submitPeriod(1, p[3], '0x04', {from: charlie}).should.be.fulfilled;
    p[4] = await auction.tipHash();
    await auction.submitPeriod(1, p[4], '0x05', {from: charlie}).should.be.fulfilled;
    p[5] = await auction.tipHash();
    // activate and submit by bob
    const bal1 = await token.balanceOf(alice);
    await auction.activate(0);
    const bal2 = await token.balanceOf(alice);
    assert.equal(bal1.add(80).toNumber(), bal2.toNumber());
    await auction.submitPeriod(0, p[5], '0x06', {from: bob}).should.be.fulfilled;
    p[6] = await auction.tipHash();
  });

  it('should allow to logout', async () => {
    await auction.bet(0, 0, bob, {from: bob}).should.be.fulfilled;
  });

  it('should prevent submission by logged-out slot in later epoch', async () => {
    // increment epoch
    await auction.submitPeriod(1, p[6], '0x07', {from: charlie}).should.be.fulfilled;
    p[7] = await auction.tipHash();
    await auction.submitPeriod(1, p[4], '0x08', {from: charlie}).should.be.fulfilled;
    p[8] = await auction.tipHash();
    // try to submit when logged out
    await auction.submitPeriod(0, p[8], '0x09', {from: bob}).should.be.rejectedWith(EVMRevert);
  });

  it('should allow to withdraw after logout', async () => {
    // increment epoch
    await auction.submitPeriod(1, p[8], '0x09', {from: charlie}).should.be.fulfilled;
    p[9] = await auction.tipHash();
    await auction.submitPeriod(1, p[9], '0x0a', {from: charlie}).should.be.fulfilled;
    // activate logout
    const bal1 = await token.balanceOf(bob);
    await auction.activate(0);
    const bal2 = await token.balanceOf(bob);
    assert.equal(bal1.add(120).toNumber(), bal2.toNumber());
  });

});
