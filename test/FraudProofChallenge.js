import utils from 'ethereumjs-util';
import assertRevert from './helpers/assertRevert';
import { Tx, Block } from 'parsec-lib';
const ParsecBridge = artifacts.require('./ParsecBridge.sol');
const SimpleToken = artifacts.require('SimpleToken');

contract('ParsecBridge', (accounts) => {
  const blockReward = 5000000;
  const c = accounts[0];  // operator charlie, stake: 4 * ts / epochLength
  const cPriv = '0xa25963422815d4a308aa6716fc4bdf353d233806213b2fd5951ddb2e2593f3db';
  const d = accounts[1];  // operator danie,   stake: 1 * ts / epochLength
  const dPriv = '0x51e314e6ee199c015ccf37d41dbfc5735b2c489b42d4c04796a8e9074063c23c';
  const e = accounts[2];  // operator eric,    stake: 3 * ts / epochLength
  const ePriv = '0x2b88bbdef3d0706e0cb4d8ee1bcf2d8f26e764ac49d602210215f434923c0715';
  const f = accounts[3];
  const fPriv = '0x1f5f78300dcf8733fed1cdc3ffb7e93f101af70a25108ace720e390b8c155032';
  const ops = [c, d, e];
  let parsec;
  let token;
  let epochLength;
  let totalSupply;
  let b = [];
  let depositProof;
  let prevProof;
  let transferProof;
  

  //
  // b[0]
  //
  before(async () => {
    token = await SimpleToken.new();
    // initialize contract
    parsec = await ParsecBridge.new(token.address, 0, 8, blockReward, 0);
    b[0] = await parsec.tipHash();

    epochLength = await parsec.epochLength();
    totalSupply = await token.totalSupply();
    await token.transfer(d, totalSupply.div(epochLength));
    await token.transfer(e, totalSupply.div(epochLength).mul(3));
  });  

  it('should allow build chain', async () => {
    await token.approve(parsec.address, totalSupply, {from: c});
    await parsec.join(totalSupply.div(epochLength * 10).mul(4), {from: c});

    await token.approve(parsec.address, totalSupply, {from: d});
    await parsec.join(totalSupply.div(epochLength * 10).mul(1), {from: d});

    await token.approve(parsec.address, totalSupply, {from: e});
    await parsec.join(totalSupply.div(epochLength * 10).mul(2), {from: e});

    const cb = new Tx().coinbase(blockReward, c);
    let block = new Block(b[0], 1).addTx(cb);
    await parsec.submitBlock(b[0], block.merkleRoot(), ...block.sign(cPriv));
    b[1] = block.hash();
    console.log('b1', b[1]);
    assert.equal(b[1], await parsec.tipHash());

    block = new Block(b[1], 2).addTx(new Tx().coinbase(blockReward, d));
    const transfer = new Tx().transfer([{
    	prevTx: cb.hash(),
    	outPos: 0
    }], [{
    	blockReward,
    	addr: d
   	}]);
    block.addTx(transfer.sign([cPriv]));
    await parsec.submitBlock(b[1], block.merkleRoot(), ...block.sign(dPriv));
    b[2] = block.hash();
    prevProof = block.proof(transfer.buf(), 1, [new Tx().coinbase(blockReward, d).hash()]);
    console.log('b2', b[2]);

    const receipt = await parsec.deposit(blockReward, { from: e }); 
    const depositId = receipt.logs[0].args.depositId.toNumber();
    console.log(depositId);

    block = new Block(b[2], 3).addTx(new Tx().coinbase(blockReward, e));
    block.addTx(new Tx().deposit(depositId, blockReward, e));
    await parsec.submitBlock(b[2], block.merkleRoot(), ...block.sign(ePriv));
    b[3] = block.hash();
    console.log('b3', b[3]);

    block = new Block(b[3], 4).addTx(new Tx().coinbase(blockReward, e));
    await parsec.submitBlock(b[3], block.merkleRoot(), ...block.sign(ePriv));
    b[4] = block.hash();
    console.log('b4', b[4]);

    block = new Block(b[4], 5).addTx(new Tx().coinbase(blockReward, c));
    await parsec.submitBlock(b[4], block.merkleRoot(), ...block.sign(cPriv));
    b[5] = block.hash();
    console.log('b5', b[5]);

    block = new Block(b[2],3).addTx(new Tx().coinbase(blockReward, d));
    await parsec.submitBlock(b[2], block.merkleRoot(), ...block.sign(dPriv));
    b[6] = block.hash();
    console.log('b6', b[6]);

    block = new Block(b[6],4).addTx(new Tx().coinbase(blockReward, d));
    await parsec.submitBlock(b[6], block.merkleRoot(), ...block.sign(dPriv));
    b[7] = block.hash();
    console.log('b7', b[7]);

    block = new Block(b[7],5).addTx(new Tx().coinbase(blockReward, d));
    await parsec.submitBlock(b[7], block.merkleRoot(), ...block.sign(dPriv));
    b[8] = block.hash();
    console.log('b8', b[8]);

    block = new Block(b[8],6).addTx(new Tx().coinbase(blockReward, d));
    await parsec.submitBlock(b[8], block.merkleRoot(), ...block.sign(dPriv));
    b[9] = block.hash();
    console.log('b9', b[9]);

    const coinbase = new Tx().coinbase(blockReward, c);
    const deposit2 = new Tx().deposit(depositId, blockReward, c);
    block = new Block(b[2],3).addTx(coinbase).addTx(deposit2);
    await parsec.submitBlock(b[2], block.merkleRoot(), ...block.sign(cPriv));
    b[10] = block.hash();
    depositProof = block.proof(deposit2.buf(), 1, [coinbase.hash()]);
    console.log('b10', b[10]);

    block = new Block(b[10],4).addTx(new Tx().coinbase(blockReward, c));
    await parsec.submitBlock(b[10], block.merkleRoot(), ...block.sign(cPriv));
    b[11] = block.hash();
    console.log('b11', b[11]);

    block = new Block(b[3],4).addTx(new Tx().coinbase(blockReward, c));
    block.addTx(transfer);
    await parsec.submitBlock(b[3], block.merkleRoot(), ...block.sign(cPriv));
    b[12] = block.hash();
    transferProof = block.proof(transfer.buf(), 1, [new Tx().coinbase(blockReward, c).hash()]);
    console.log('b12', b[12]);

    assert.equal(b[9], await parsec.tipHash());
  });

  it('should allow to clip light branch', async () => {
    let data = [
      b[1], // parent of fork node
      // light.       heavy
      `0x060000000000010500000000${c.replace('0x', '')}`, // c
      `0x010000000000040000000000${d.replace('0x', '')}`, // d
      `0x000000000000020300000000${e.replace('0x', '')}`, // e
      b[5], // heavy tip
      b[9], // light tip
    ];
    const bal1 = await token.balanceOf(c);
    await parsec.reportLightBranch(data, {from: c});
    const bal2 = await token.balanceOf(c);
    assert(bal1.toNumber() < bal2.toNumber());
    assert.equal(b[5], await parsec.tipHash());
  });

  it('should allow to report invalid deposit', async () => {
  	const bal1 = await token.balanceOf(d);
    await parsec.reportInvalidDeposit(depositProof, {from: d});
    const bal2 = await token.balanceOf(d);
    assert(bal1.toNumber() < bal2.toNumber());
  });

  it('should allow to report double spend', async () => {
  	const bal1 = await token.balanceOf(d);
    await parsec.reportDoubleSpend(transferProof, prevProof, {from: d});
    const bal2 = await token.balanceOf(d);
    assert(bal1.toNumber() < bal2.toNumber());
  });

  it('should allow one more validator to join and mine block', async () => {
  	let bal = await token.balanceOf(d);
  	await token.transfer(f, bal, {from: d});
  	bal = await token.balanceOf(e);
  	await token.transfer(f, bal, {from: e});

  	await token.approve(parsec.address, totalSupply, {from: f});
    await parsec.join(totalSupply.div(epochLength * 10), {from: f});

    let block = new Block(b[5],6).addTx(new Tx().coinbase(blockReward, f));
    await parsec.submitBlockAndPrune(b[5], block.merkleRoot(), ...block.sign(fPriv), [b[7], b[8], b[9], b[11]]);
    b[12] = block.hash();
    console.log('b12', b[12]);
  });

});
