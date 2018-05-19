import utils from 'ethereumjs-util';
import EVMRevert from './helpers/EVMRevert';
import assertRevert from './helpers/assertRevert';
import chai from 'chai';
const StakingAuction = artifacts.require('./StakingAuction.sol');
const SimpleToken = artifacts.require('SimpleToken');

const should = chai
  .use(require('chai-as-promised'))
  .should();

contract('StakingAuction', (accounts) => {
  const alice = accounts[0];
  const bob = accounts[1];
  const charlie = accounts[2];

  let auction;
  let token;
  let totalSupply;

  before(async () => {
    token = await SimpleToken.new();
    // initialize contract
    auction = await StakingAuction.new(token.address, 4);
    totalSupply = await token.totalSupply();
    token.transfer(bob, totalSupply.div(3));
    token.transfer(charlie, totalSupply.div(3));
  });

  it('should prevent submission by unbonded validators', async () => {
    await auction.submitBlock(0, alice).should.be.rejectedWith(EVMRevert);
  });

  it('should allow to buy slot and submit block', async () => {
    await token.approve(auction.address, totalSupply, {from: alice});
    await auction.buy(0, 100, alice, {from: alice}).should.be.fulfilled;
    await auction.submitBlock(0, alice).should.be.fulfilled;
  });

  it('should prevent auctining for lower price', async () => {
    await token.approve(auction.address, totalSupply, {from: bob});
    await auction.buy(0, 99, bob, {from: bob}).should.be.rejectedWith(EVMRevert);
    await auction.buy(0, 101, bob, {from: bob}).should.be.rejectedWith(EVMRevert);
  });

  it('should allow to be slashed',  async () => {
    await auction.slash(0, 20).should.be.fulfilled;
  });

  it('should allow to auction for higer price',  async () => {
    await auction.buy(0, 120, bob, {from: bob}).should.be.fulfilled;
  });

  it('should allow submission when slot auctioned in same epoch', async () => {
    await auction.submitBlock(0, alice).should.be.fulfilled;
  });

  it('should prevent submission by auctioned slot in later epoch', async () => {
    await auction.incrementEpoch();
    await auction.submitBlock(0, alice).should.be.rejectedWith(EVMRevert);
    await auction.submitBlock(0, bob).should.be.rejectedWith(EVMRevert);
  });

  it('should allow to activate auctioned slot and submit', async () => {
    await auction.incrementEpoch();
    const bal1 = await token.balanceOf(alice);
    await auction.activate(0);
    const bal2 = await token.balanceOf(alice);
    assert.equal(bal1.add(80).toNumber(), bal2.toNumber());
    await auction.submitBlock(0, bob).should.be.fulfilled;
  });

  it('should allow to logout', async () => {
    await auction.buy(0, 0, bob, {from: bob}).should.be.fulfilled;
  });

  it('should prevent submission by logged-out slot in later epoch', async () => {
    await auction.incrementEpoch();
    await auction.submitBlock(0, bob).should.be.rejectedWith(EVMRevert);
  });

  it('should allow to withdraw after logout', async () => {
    await auction.incrementEpoch();
    const bal1 = await token.balanceOf(bob);
    await auction.activate(0);
    const bal2 = await token.balanceOf(bob);
    assert.equal(bal1.add(120).toNumber(), bal2.toNumber());
  });

});
