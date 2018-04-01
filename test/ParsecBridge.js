import utils from 'ethereumjs-util';
const ParsecBridge = artifacts.require('./ParsecBridge.sol');
const SimpleToken = artifacts.require('SimpleToken');

function hash(prevHash, newHeight, root) {
  const payload = Buffer.alloc(72);
  payload.write(prevHash.replace('0x',''), 0, 'hex');
  payload.writeUInt32BE(0, 32);
  payload.writeUInt32BE(newHeight, 36);
  payload.write(root.replace('0x','').replace('0x',''), 40, 'hex');
  return utils.bufferToHex(utils.sha3(payload));
}

contract('Parsec', (accounts) => {
  const mRoot0 = '0x0000000000000000000000000000000000000000000000000000000000000001';
  const mRoot1 = '0x0000000000000000000000000000000000000000000000000000000000000002';
  const mRoot2 = '0x0000000000000000000000000000000000000000000000000000000000000003';
  const c = accounts[0];  // operator charlie, stake: 4 * ts / epochLength
  const d = accounts[1];  // operator danie,   stake: 1 * ts / epochLength
  const e = accounts[2];  // operator eric,    stake: 3 * ts / epochLength
  const ops = [c, d, e];
  let parsec;
  let token;
  let epochLength;
  let totalSupply;
  let b = [];

  //
  // b[0]
  //
  before(async () => {
    token = await SimpleToken.new();
    // initialize contract
    parsec = await ParsecBridge.new(token.address, 0, 8);
    epochLength = await parsec.epochLength();
    totalSupply = await token.totalSupply();
    token.transfer(accounts[1], totalSupply.div(epochLength));
    token.transfer(accounts[2], totalSupply.div(epochLength).mul(3));
  });  

  //
  // b[0] -> b[1,c]
  //
  it('should allow to join and submit block', async () => {
    await token.approve(parsec.address, totalSupply, {from: c});
    await parsec.join(totalSupply.div(epochLength).mul(4), {from: c});
    b[0] = await parsec.tipHash();

    await parsec.submitBlock(b[0], mRoot1, {from: c});
    b[1] = hash(b[0], 1, mRoot1);
    assert.equal(b[1], await parsec.tipHash());
  });

  //
  // b[0] -> b[1,c] -> b[2,d]
  //
  it('should allow second operator to join and submit block', async () => {
    await token.approve(parsec.address, totalSupply, {from: d});
    await parsec.join(totalSupply.div(epochLength).mul(1), {from: d});

    await parsec.submitBlock(b[1], mRoot1, {from: d});
    b[2] = hash(b[1], 2, mRoot1);
    assert.equal(b[2], await parsec.tipHash());
  });

  //                           /-> b[3,e]  <- 4 rewards
  // b[0,c] -> b[1,c] -> b[2,d] -> b[4,c]  <- 4 rewards
  //                           \-> b[5,d]  <- 3 rewards
  it('should allow to branch', async () => {
    await token.approve(parsec.address, totalSupply, {from: e});
    await parsec.join(totalSupply.div(epochLength).mul(3), {from: e});

    // 3 blocks in paralel
    await parsec.submitBlock(b[2], mRoot0, {from: e});
    b[3] = hash(b[2], 3, mRoot0);
    assert.equal(b[3], (await parsec.getTip(ops))[0]);

    await parsec.submitBlock(b[2], mRoot1, {from: c});
    b[4] = hash(b[2], 3, mRoot1);
    assert.equal(b[3], (await parsec.getTip(ops))[0]);
    
    // tip not updated because operator D reached share
    await parsec.submitBlock(b[2], mRoot2, {from: d});
    b[5] = hash(b[2], 3, mRoot2);
    assert.equal(b[3], (await parsec.getTip(ops))[0]);
  });

  //                           /-> b[3,e]  <- 4 rewards
  // b[0,c] -> b[1,c] -> b[2,d] -> b[4,c]  <- 4 rewards
  //                           \-> b[5,d] -> b[6,c] -> b[16,c]  <- 5 rewards
  it('should allow build longer chain', async () => {
    await parsec.submitBlock(b[5], mRoot2, {from: c});
    b[6] = hash(b[5], 4, mRoot2);
    let tip = await parsec.getTip(ops);
    assert.equal(b[3], tip[0]);
    assert.equal(4, tip[1]);

    await parsec.submitBlock(b[6], mRoot2, {from: c});
    b[16] = hash(b[6], 5, mRoot2);
    tip = await parsec.getTip(ops);
    assert.equal(b[16], tip[0]);
    assert.equal(5, tip[1]);
  });

  //                           /-> b[3,e]  <- 4 rewards
  // b[0,c] -> b[1,c] -> b[2,d] -> b[4,c] -> b[7,e] -> b[8,e] -> b[9,c]   <- 7 rewards
  //                           \-> b[5,d] -> b[6,c] -> b[16,c]   <- 5 rewards
  it('should allow to extend other branch', async () => {
    await parsec.submitBlock(b[4], mRoot1, {from: e});
    b[7] = hash(b[4], 4, mRoot1);

    await parsec.submitBlock(b[7], mRoot1, {from: e});
    b[8] = hash(b[7], 5, mRoot1);

    await parsec.submitBlock(b[8], mRoot1, {from: c});
    b[9] = hash(b[8], 6, mRoot1);
    let tip = await parsec.getTip(ops);
    assert.equal(b[9], tip[0]);
    assert.equal(7, tip[1]);
  });
    
  //                           /-> xxxxxx
  // b[0,c] -> b[1,c] -> b[2,d] -> b[4,c] -> b[7,e] -> b[8,e] -> ... -> b[15]
  //                           \-> xxxxxx -> b[6,c] -> b[16,c]
  it('should allow to prune', async () => {
    await parsec.submitBlock(b[9], mRoot1);
    b[10] = hash(b[9], 7, mRoot1);
    assert.equal(b[10], await parsec.tipHash());

    await parsec.submitBlock(b[10], mRoot1);
    b[11] = hash(b[10], 8, mRoot1);
    assert.equal(b[11], await parsec.tipHash());

    await parsec.submitBlock(b[11], mRoot1);
    b[12] = hash(b[11], 9, mRoot1);
    assert.equal(b[12], await parsec.tipHash());

    const receipt1 = await parsec.submitBlock(b[12], mRoot1);
    b[13] = hash(b[12], 10, mRoot1);
    assert.equal(b[13], await parsec.tipHash());

    // test pruning
    assert.equal((await parsec.getBranchCount(b[2])).toNumber(), 3);
    const receipt2 = await parsec.submitBlock(b[13], mRoot1); // <- this call is pruning
    assert.equal((await parsec.getBranchCount(b[2])).toNumber(), 1);
    assert(receipt1.receipt.gasUsed > receipt2.receipt.gasUsed);
    b[14] = hash(b[13], 11, mRoot1);
    assert.equal(b[14], await parsec.tipHash());

    // prune orphans
    const receipt3 = await parsec.submitBlockAndPrune(b[14], mRoot1, [b[6], b[16]]); 
    assert(receipt1.receipt.gasUsed > receipt3.receipt.gasUsed);
    b[15] = hash(b[14], 12, mRoot1);
    assert.equal(b[15], await parsec.tipHash());

    let tip = await parsec.getHighest();
    assert.equal(tip[1].toNumber(), 12);
    assert.equal(tip[3], accounts[0]);
  });

  //
  // b[0] -> b[1] -> ... -> b[15] -> b[16] -> ... -> b[24]
  //
  it('should allow to mine beyond archive horizon and delete genesis', async () => {
    // more blocks
    await parsec.submitBlock(b[15], mRoot1);
    b[17] = hash(b[15], 13, mRoot1);
    assert.equal(b[17], await parsec.tipHash());

    await parsec.submitBlock(b[17], mRoot1);
    b[18] = hash(b[17], 14, mRoot1);
    await parsec.submitBlock(b[18], mRoot1);
    b[19] = hash(b[18], 15, mRoot1);
    await parsec.submitBlock(b[19], mRoot1);
    b[20] = hash(b[19], 16, mRoot1);
    await parsec.submitBlock(b[20], mRoot1);
    b[21] = hash(b[20], 17, mRoot1);
    await parsec.submitBlock(b[21], mRoot1);
    b[22] = hash(b[21], 18, mRoot1);
    await parsec.submitBlock(b[22], mRoot1);
    b[23] = hash(b[22], 19, mRoot1);
    await parsec.submitBlock(b[23], mRoot1);
    b[24] = hash(b[23], 20, mRoot1);
    await parsec.submitBlock(b[24], mRoot1);
    b[25] = hash(b[24], 21, mRoot1);

    const receipt1 = await parsec.submitBlock(b[25], mRoot1);
    b[26] = hash(b[25], 22, mRoot1);
    assert.equal(b[26], await parsec.tipHash());

    await parsec.submitBlock(b[26], mRoot1);
    b[27] = hash(b[26], 23, mRoot1);

    // archive genesis
    const receipt2 = await parsec.submitBlockAndPrune(b[27], mRoot1, [b[0]]);
    assert(receipt1.receipt.gasUsed > receipt2.receipt.gasUsed);
    assert(receipt2.logs[1].event == 'ArchiveBlock');
    b[28] = hash(b[27], 24, mRoot1);

    let tip = await parsec.getTip(ops);
    assert.equal(b[28], tip[0]);
    assert.equal(4, tip[1]);
  });

});