import chai from 'chai';
import util from 'ethereumjs-util';

import { Period, Block, Tx, Input, Output, Outpoint, Exit } from 'parsec-lib';

const ParsecBridge = artifacts.require('./ParsecBridge.sol');
const PriorityQueue = artifacts.require('./PriorityQueue.sol');
const ExitToken = artifacts.require('./ExitToken.sol');
const TxLib = artifacts.require('./TxLib.sol');
const SimpleToken = artifacts.require('SimpleToken');

chai.use(require('chai-as-promised')).should();

contract('TokenizedExits', (accounts) => {

  const alice = accounts[0];
  const alicePriv = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';
  const bob = accounts[1];
  const p = [];
  let bridge;
  let token;
  let exitToken;
  before(async () => {
    token = await SimpleToken.new();

    // deploy bridge
    const pqLib = await PriorityQueue.new();
    ParsecBridge.link('PriorityQueue', pqLib.address);
    bridge = await ParsecBridge.new(4, 50, 0, 0, 50);
    await bridge.registerToken(token.address);

    exitToken = await ExitToken.new(bridge.address);

    p[0] = await bridge.tipHash();

    // alice auctions slot
    await token.approve(bridge.address, 1000, {from: alice});
    // aprove exit token contract to spend native tokens to pay the stake
    await token.approve(exitToken.address, 1000, {from: alice});
    await bridge.bet(0, 150, alice, alice, {from: alice}).should.be.fulfilled;
  });

  it('should set Bridge addresss correctly on ExitToken', async () => {
    const bridgeAddress = await exitToken.bridge();
    assert(bridgeAddress == bridge.address);
  });

  it('should allow tokenized exit of simple transfer', async () => {
    const deposit = Tx.deposit(114, 50, alice);
    let transfer = Tx.transfer(
      [new Input(new Outpoint(deposit.hash(), 0))],
      [new Output(50, exitToken.address)]
    );
    transfer = transfer.sign([alicePriv]);

    let block = new Block(96).addTx(deposit).addTx(transfer);
    let period = new Period(p[0], [block]);
    p[1] = period.merkleRoot();
    await bridge.submitPeriod(0, p[0], p[1], {from: alice}).should.be.fulfilled;
    const proof = period.proof(transfer);

    // init tokenized exit and check state
    await exitToken.proxyExit(proof, 0).should.be.fulfilled;
    const utxoId = (new Outpoint(transfer.hash(), 0)).getUtxoId();
    const owner = await exitToken.ownerOf(utxoId);
    assert(owner == alice);

    // finalize exit and check balance of alice and contract
    const bal1 = await token.balanceOf(alice);
    await bridge.finalizeExits(0).should.be.fulfilled;
    const bal2 = await token.balanceOf(alice);
    assert(bal2.toNumber() == bal1.toNumber());

    // exchange NFT for tokens and check balance correct
    await exitToken.withdrawUtxo(utxoId).should.be.fulfilled;
    const bal3 = await token.balanceOf(alice);
    const exitStake = (await bridge.exitStake()).toNumber();
    assert.equal(bal3.toNumber(), bal1.toNumber() + 50 + exitStake);
  });

  it('should allow exit of second output', async () => {
    const deposit = Tx.deposit(114, 125, alice);
    let transfer = Tx.transfer(
      [new Input(new Outpoint(deposit.hash(), 0))],
      [new Output(50, alice), new Output(75, exitToken.address)]
    );
    transfer = transfer.sign([alicePriv]);

    let block = new Block(96).addTx(deposit).addTx(transfer);
    let period = new Period(p[1], [block]);
    await bridge.submitPeriod(0, p[1], period.merkleRoot(),
      {from: alice}).should.be.fulfilled;
    const proof = period.proof(transfer);

    // init tokenized exit
    await exitToken.proxyExit(proof, 1).should.be.fulfilled;
    await bridge.finalizeExits(0).should.be.fulfilled;

    // exchange NFT for tokens and check
    const bal1 = await token.balanceOf(alice);
    const exitStake = (await bridge.exitStake()).toNumber();
    const utxoId = (new Outpoint(transfer.hash(), 1)).getUtxoId();
    await exitToken.withdrawUtxo(utxoId).should.be.fulfilled;
    const bal2 = await token.balanceOf(alice);
    assert.equal(bal2.toNumber(), bal1.toNumber() + 75 + exitStake);
  });

  it('should work with non-native tokens', async () => {
    // register new token
    const secondToken = await SimpleToken.new();
    await bridge.registerToken(secondToken.address);
    // fill up the bridge contract with some tokens
    await secondToken.approve(bridge.address, 1000, {from: alice});
    await bridge.deposit(alice, 200, 0);
    await bridge.deposit(alice, 200, 1);

    const deposit = Tx.deposit(115, 50, alice, 1);
    let transfer = Tx.transfer(
      [new Input(new Outpoint(deposit.hash(), 0))],
      [new Output(50, exitToken.address, 1)]
    );
    transfer = transfer.sign([alicePriv]);

    let block = new Block(96).addTx(deposit).addTx(transfer);
    let period = new Period(p[1], [block]);
    p[2] = period.merkleRoot();
    await bridge.submitPeriod(0, p[1], p[2], {from: alice}).should.be.fulfilled;
    const proof = period.proof(transfer);

    const nativeBal1 = await token.balanceOf(alice);
    const secondBal1 = await secondToken.balanceOf(alice);
    const exitStake = await bridge.exitStake();

    // init tokenized exit
    await exitToken.proxyExit(proof, 0).should.be.fulfilled;
    await bridge.finalizeExits(1).should.be.fulfilled;

    const nativeBal2 = await token.balanceOf(alice);
    const secondBal2 = await secondToken.balanceOf(alice);

    assert.equal(nativeBal2.toNumber(), nativeBal1.toNumber() - exitStake.toNumber());
    assert.equal(secondBal1.toNumber(), secondBal2.toNumber());

    const utxoId = (new Outpoint(transfer.hash(), 0)).getUtxoId();
    await exitToken.withdrawUtxo(utxoId).should.be.fulfilled;

    const nativeBal3 = await token.balanceOf(alice);
    const secondBal3 = await secondToken.balanceOf(alice);

    assert.equal(nativeBal1.toNumber(), nativeBal3.toNumber());
    assert.equal(secondBal1.toNumber() + 50, secondBal3.toNumber());

  })

  it('can sell signed exit', async () => {
    await token.transfer(bob, 1000);
    await token.approve(bridge.address, 1000, {from:bob});

    // alice sends the tokens she want to exit to the bridge and produces proof
    const deposit = Tx.deposit(115, 50, alice);
    let transfer = Tx.transfer(
      [new Input(new Outpoint(deposit.hash(), 0))],
      [new Output(50, bridge.address)]
    );
    transfer = transfer.sign([alicePriv]);
    let block = new Block(96).addTx(deposit).addTx(transfer);
    let period = new Period(p[2], [block]);
    p[3] = period.merkleRoot();
    await bridge.submitPeriod(0, p[2], p[3], {from: alice}).should.be.fulfilled;
    const proof = period.proof(transfer);

    // she then signes over the utxo and some number, basically saying 
    // "I agree to sell these tokens for x to whoever submits the exit"
    const utxoId = (new Outpoint(transfer.hash(), 0)).getUtxoId();
    const signedData = Exit.signOverExit(utxoId, 40, alicePriv);
    const signedDataBytes32 = Exit.bufferToBytes32Array(signedData);

    const aliceBalance1 = await token.balanceOf(alice);
    const bobBalance1 = await token.balanceOf(bob);

    // bob then recieves the signed data. He has to check the exit is valid and can
    // then submit the signed exit to the biridge, paying the agreed price to alice
    // and recieveing the exit
    
    await bridge.startBoughtExit(proof, 0, signedDataBytes32, {from: bob}).should.be.fulfilled;
    const aliceBalance2 = await token.balanceOf(alice);
    const bobBalance2 = await token.balanceOf(bob);
    const exitOwner = (await bridge.exits(utxoId))[2];
    const exitStake = (await bridge.exitStake()).toNumber();
    assert.equal(aliceBalance1.toNumber() + 40, aliceBalance2.toNumber());
    assert.equal(bobBalance1.toNumber() - 40 - exitStake, bobBalance2.toNumber());
    assert.equal(exitOwner, bob);
  });
});