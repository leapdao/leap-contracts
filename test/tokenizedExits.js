import chai from 'chai';

import { Period, Block, Tx, Input, Output, Outpoint } from 'parsec-lib';

const ParsecBridge = artifacts.require('./ParsecBridge.sol');
const PriorityQueue = artifacts.require('./PriorityQueue.sol');
const ExitToken = artifacts.require('./ExitToken.sol');
const TxLib = artifacts.require('./TxLib.sol');
const SimpleToken = artifacts.require('SimpleToken');

chai.use(require('chai-as-promised')).should();

contract('Bridge', (accounts) => {

  const alice = accounts[0];
  const alicePriv = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';
  const bob = accounts[1];
  const bobPriv = '0x7bc8feb5e1ce2927480de19d8bc1dc6874678c016ae53a2eec6a6e9df717bfac';
  const charlie = accounts[2];
  const charliePriv = '0x94890218f2b0d04296f30aeafd13655eba4c5bbf1770273276fee52cbe3f2cb4';

  describe('Test', () => {
    const p = [];
    let bridge;
    let token;
    let exitToken;
    before(async () => {
      token = await SimpleToken.new();
      const txLib = await TxLib.new();
      const pqLib = await PriorityQueue.new();
      ParsecBridge.link('PriorityQueue', pqLib.address);
      
      ExitToken.link('TxLib', txLib.address);
      exitToken = await ExitToken.new();

      bridge = await ParsecBridge.new(4, 50, 0, 0, exitToken.address);
      
      await exitToken.setBridge(bridge.address);

      await bridge.registerToken(token.address);

      p[0] = await bridge.tipHash();

      await token.transfer(bob, 1000);
      await token.transfer(charlie, 1000);

      // alice auctions slot
      await token.approve(bridge.address, 1000, {from: alice});
      await bridge.bet(0, 100, alice, alice, {from: alice}).should.be.fulfilled;
      // bob auctions slot
      await token.approve(bridge.address, 1000, {from: bob});
      await bridge.bet(1, 100, bob, bob, {from: bob}).should.be.fulfilled;
      // charlie auctions slot
      await token.approve(bridge.address, 1000, {from: charlie});
      await bridge.bet(2, 100, charlie, charlie, {from: charlie}).should.be.fulfilled;
    });

    it('Bridge addresss set correctly on ExitToken', async () => {
      const bridgeAddress = await exitToken.bridge();
      assert(bridgeAddress == bridge.address);
    });

    // test bridge setting

    it('Proxy Exit', async () => {
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

      await exitToken.proxyExit(proof, 0).should.be.fulfilled;

      const utxoId = (new Outpoint(transfer.hash(), 0)).getUtxoId();
      const owner = await exitToken.ownerOf(utxoId);

      assert(owner == alice);

      const bal1 = await token.balanceOf(alice);

      await bridge.finalizeExits(0).should.be.fulfilled;

      const bal2 = await token.balanceOf(alice);

      assert(bal2.toNumber() == bal1.toNumber());

      assert((await exitToken.exitValue(utxoId)).toNumber() == 50);

      await exitToken.withdrawUtxo(utxoId).should.be.fulfilled;

      const bal3 = await token.balanceOf(alice);

      assert(bal3.toNumber() > bal1.toNumber());

      // assert(false);
    });

  });
});