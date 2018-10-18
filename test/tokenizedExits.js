import chai from 'chai';

import { Period, Block, Tx, Input, Output, Outpoint } from 'parsec-lib';

const ParsecBridge = artifacts.require('./ParsecBridge.sol');
const PriorityQueue = artifacts.require('./PriorityQueue.sol');
const ExitToken = artifacts.require('./ExitToken.sol');
const TxLib = artifacts.require('./TxLib.sol');
const SimpleToken = artifacts.require('SimpleToken');

chai.use(require('chai-as-promised')).should();

contract('TokenizedExits', (accounts) => {

  const alice = accounts[0];
  const alicePriv = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';
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
    assert.equal(bal3.toNumber(), bal1.toNumber() + 50);
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
    const utxoId = (new Outpoint(transfer.hash(), 1)).getUtxoId();
    await exitToken.withdrawUtxo(utxoId).should.be.fulfilled;
    const bal2 = await token.balanceOf(alice);
    assert.equal(bal2.toNumber(), bal1.toNumber() + 75);
  });
});