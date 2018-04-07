import utils from 'ethereumjs-util';
const ParsecBridge = artifacts.require('./ParsecBridge.sol');
const SimpleToken = artifacts.require('SimpleToken');

function blockHash(prevHash, newHeight, root, v, r, s) {
  const payload = Buffer.alloc(137);
  payload.write(prevHash.replace('0x',''), 0, 'hex');
  payload.writeUInt32BE(0, 32);
  payload.writeUInt32BE(newHeight, 36);
  payload.write(root.replace('0x',''), 40, 'hex');
  payload.writeUInt8(v, 72);
  payload.write(r.replace('0x',''), 73, 'hex');
  payload.write(s.replace('0x',''), 105, 'hex');
  return utils.bufferToHex(utils.sha3(payload));
}

function signHeader(prevHash, newHeight, root, privKey) {
  const privBuf = new Buffer(privKey.replace('0x', ''), 'hex');
  const payload = Buffer.alloc(72);
  payload.write(prevHash.replace('0x',''), 0, 'hex');
  payload.writeUInt32BE(0, 32);
  payload.writeUInt32BE(newHeight, 36);
  payload.write(root.replace('0x',''), 40, 'hex');
  const sig = utils.ecsign(utils.sha3(payload), privBuf);
  return [sig.v, `0x${sig.r.toString('hex')}`, `0x${sig.s.toString('hex')}`];
}

function rootHash(coinbaseHash) {
  const payload = Buffer.alloc(64);
  payload.write(coinbaseHash.replace('0x',''), 0, 'hex');
  // 32 bytes empty
  //payload.write('0000000000000000000000000000000000000000000000000000000000000000', 32, 'hex');
  return utils.bufferToHex(utils.sha3(payload));
}

function txHash(height, coinbase, operatorAddr) {
  const payload = Buffer.alloc(63 + (32 * coinbase.length));
  payload.writeUInt8(0, 0);
  payload.writeUInt32BE(0, 1);
  payload.writeUInt32BE(height, 5);
  payload.writeUInt8(coinbase.length, 9);
  for(let i = 0; i < coinbase.length; i++) {
    payload.write(coinbase[i].replace('0x',''), 10 + (i * 32), 'hex');
  }
  payload.writeUInt8(1, 10 + (coinbase.length * 32));
  payload.write(operatorAddr.replace('0x',''), 43 + (coinbase.length * 32), 'hex');
  return utils.bufferToHex(utils.sha3(payload));
}

contract('Parsec', (accounts) => {
  const empty = '0x0000000000000000000000000000000000000000000000000000000000000000';
  const mRoot0 = '0x0000000000000000000000000000000000000000000000000000000000000001';
  const mRoot1 = '0x0000000000000000000000000000000000000000000000000000000000000002';
  const mRoot2 = '0x0000000000000000000000000000000000000000000000000000000000000003';
  const c = accounts[0];  // operator charlie, stake: 4 * ts / epochLength
  const cPriv = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';
  const d = accounts[1];  // operator danie,   stake: 1 * ts / epochLength
  const dPriv = '0x7bc8feb5e1ce2927480de19d8bc1dc6874678c016ae53a2eec6a6e9df717bfac';
  const e = accounts[2];  // operator eric,    stake: 3 * ts / epochLength
  const ePriv = '0x94890218f2b0d04296f30aeafd13655eba4c5bbf1770273276fee52cbe3f2cb4';
  const ops = [c, d, e];
  let parsec;
  let token;
  let epochLength;
  let totalSupply;
  let b = [];
  let claimV, claimR, claimS;

  //
  // b[0]
  //
  before(async () => {
    token = await SimpleToken.new();
    // initialize contract
    parsec = await ParsecBridge.new(token.address, 0, 8, 5000000, 0);
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

    let merkleRoot = rootHash(txHash(1, [], c));
    const [v, r, s] = signHeader(b[0], 1, merkleRoot, cPriv);
    await parsec.submitBlock(b[0], merkleRoot, v, r, s, {from: c});
    b[1] = blockHash(b[0], 1, merkleRoot, v, r, s);
    assert.equal(b[1], await parsec.tipHash());
  });

  //
  // b[0] -> b[1,c] -> b[2,d]
  //
  it('should allow second operator to join and submit block', async () => {
    await token.approve(parsec.address, totalSupply, {from: d});
    await parsec.join(totalSupply.div(epochLength).mul(1), {from: d});

    const [v, r, s] = signHeader(b[1], 2, mRoot1, dPriv);
    await parsec.submitBlock(b[1], mRoot1, v, r, s);
    b[2] = blockHash(b[1], 2, mRoot1, v, r, s);
    assert.equal(b[2], await parsec.tipHash());
  });

  //                           /-> b[3,e]  <- 4 rewards
  // b[0,c] -> b[1,c] -> b[2,d] -> b[4,c]  <- 4 rewards
  //                           \-> b[5,d]  <- 3 rewards
  it('should allow to branch', async () => {
    await token.approve(parsec.address, totalSupply, {from: e});
    await parsec.join(totalSupply.div(epochLength).mul(3), {from: e});

    // 3 blocks in paralel
    let [v, r, s] = signHeader(b[2], 3, mRoot0, ePriv);
    await parsec.submitBlock(b[2], mRoot0, v, r, s);
    b[3] = blockHash(b[2], 3, mRoot0, v, r, s);
    assert.equal(b[3], (await parsec.getTip(ops))[0]);

    let merkleRoot = rootHash(txHash(3, [b[1]], c));
    [v, r, s] = signHeader(b[2], 3, merkleRoot, cPriv);
    await parsec.submitBlock(b[2], merkleRoot, v, r, s);
    b[4] = blockHash(b[2], 3, merkleRoot, v, r, s);
    assert.equal(b[3], (await parsec.getTip(ops))[0]);
    
    // tip not updated because operator D reached share
    [v, r, s] = signHeader(b[2], 3, mRoot2, dPriv);
    await parsec.submitBlock(b[2], mRoot2, v, r, s);
    b[5] = blockHash(b[2], 3, mRoot2, v, r, s);
    assert.equal(b[3], (await parsec.getTip(ops))[0]);
  });

  //                           /-> b[3,e]  <- 4 rewards
  // b[0,c] -> b[1,c] -> b[2,d] -> b[4,c]  <- 4 rewards
  //                           \-> b[5,d] -> b[6,c] -> b[16,c]  <- 5 rewards
  it('should allow build longer chain', async () => {
    let [v, r, s] = signHeader(b[5], 4, mRoot2, cPriv);
    await parsec.submitBlock(b[5], mRoot2, v, r, s, {from: c});
    b[6] = blockHash(b[5], 4, mRoot2, v, r, s);
    let tip = await parsec.getTip(ops);
    assert.equal(b[3], tip[0]);
    assert.equal(4, tip[1]);

    [v, r, s] = signHeader(b[6], 5, mRoot2, cPriv);
    await parsec.submitBlock(b[6], mRoot2, v, r, s, {from: c});
    b[16] = blockHash(b[6], 5, mRoot2, v, r, s);
    tip = await parsec.getTip(ops);
    assert.equal(b[16], tip[0]);
    assert.equal(5, tip[1]);
  });

  //                           /-> b[3,e]  <- 4 rewards
  // b[0,c] -> b[1,c] -> b[2,d] -> b[4,c] -> b[7,e] -> b[8,e] -> b[9,c]   <- 7 rewards
  //                           \-> b[5,d] -> b[6,c] -> b[16,c]   <- 5 rewards
  it('should allow to extend other branch', async () => {
    let [v, r, s] = signHeader(b[4], 4, mRoot1, ePriv);
    await parsec.submitBlock(b[4], mRoot1, v, r, s, {from: e});
    b[7] = blockHash(b[4], 4, mRoot1, v, r, s);

    [v, r, s] = signHeader(b[7], 5, mRoot1, ePriv);
    await parsec.submitBlock(b[7], mRoot1, v, r, s, {from: e});
    b[8] = blockHash(b[7], 5, mRoot1, v, r, s);

    let merkleRoot = rootHash(txHash(6, [b[1], b[4]], c));
    [v, r, s] = signHeader(b[8], 6, merkleRoot, cPriv);
    await parsec.submitBlock(b[8], merkleRoot, v, r, s, {from: c});
    b[9] = blockHash(b[8], 6, merkleRoot, v, r, s);
    let tip = await parsec.getTip(ops);
    assert.equal(b[9], tip[0]);
    assert.equal(7, tip[1]);

    await parsec.requestLeave({from: d});
  });
    
  //                           /-> xxxxxx
  // b[0,c] -> b[1,c] -> b[2,d] -> b[4,c] -> b[7,e] -> b[8,e] -> ... -> b[15]
  //                           \-> xxxxxx -> b[6,c] -> b[16,c]
  it('should allow to prune', async () => {
    let merkleRoot = rootHash(txHash(7, [b[1], b[4], b[9]], c));
    [claimV, claimR, claimS] = signHeader(b[9], 7, merkleRoot, cPriv);
    await parsec.submitBlock(b[9], merkleRoot, claimV, claimR, claimS, {from: c});
    b[10] = blockHash(b[9], 7, merkleRoot, claimV, claimR, claimS);
    assert.equal(b[10], await parsec.tipHash());

    let [v, r, s] = signHeader(b[10], 8, mRoot1, cPriv);
    await parsec.submitBlock(b[10], mRoot1, v, r, s);
    b[11] = blockHash(b[10], 8, mRoot1, v, r, s);
    assert.equal(b[11], await parsec.tipHash());

    [v, r, s] = signHeader(b[11], 9, mRoot1, cPriv);
    await parsec.submitBlock(b[11], mRoot1, v, r, s);
    b[12] = blockHash(b[11], 9, mRoot1, v, r, s);
    assert.equal(b[12], await parsec.tipHash());

    [v, r, s] = signHeader(b[12], 10, mRoot1, cPriv);
    const receipt1 = await parsec.submitBlock(b[12], mRoot1, v, r, s);
    b[13] = blockHash(b[12], 10, mRoot1, v, r, s);
    assert.equal(b[13], await parsec.tipHash());

    // test pruning
    assert.equal((await parsec.getBranchCount(b[2])).toNumber(), 3);
    [v, r, s] = signHeader(b[13], 11, mRoot1, cPriv);
    const receipt2 = await parsec.submitBlock(b[13], mRoot1, v, r, s); // <- this call is pruning
    assert.equal((await parsec.getBranchCount(b[2])).toNumber(), 1);
    assert(receipt1.receipt.gasUsed > receipt2.receipt.gasUsed);
    b[14] = blockHash(b[13], 11, mRoot1, v, r, s);
    assert.equal(b[14], await parsec.tipHash());

    // prune orphans
    [v, r, s] = signHeader(b[14], 12, mRoot1, cPriv);
    const receipt3 = await parsec.submitBlockAndPrune(b[14], mRoot1, v, r, s, [b[6], b[16]]); 
    assert(receipt1.receipt.gasUsed > receipt3.receipt.gasUsed);
    b[15] = blockHash(b[14], 12, mRoot1, v, r, s);
    assert.equal(b[15], await parsec.tipHash());
  });

  //
  // b[0] -> b[1] -> ... -> b[15] -> b[16] -> ... -> b[24]
  //
  it('should allow to mine beyond archive horizon and delete genesis', async () => {
    // more blocks
    let [v, r, s] = signHeader(b[15], 13, mRoot1, cPriv);
    await parsec.submitBlock(b[15], mRoot1, v, r, s);
    b[17] = blockHash(b[15], 13, mRoot1, v, r, s);
    assert.equal(b[17], await parsec.tipHash());

    for(let i = 17; i < 25; i++) {
      [v, r, s] = signHeader(b[i], i-3, mRoot1, cPriv);
      await parsec.submitBlock(b[i], mRoot1, v, r, s);
      b[i+1] = blockHash(b[i], i-3, mRoot1, v, r, s);      
    }

    [v, r, s] = signHeader(b[25], 22, mRoot1, cPriv);
    const receipt1 = await parsec.submitBlock(b[25], mRoot1, v, r, s);
    b[26] = blockHash(b[25], 22, mRoot1, v, r, s);
    assert.equal(b[26], await parsec.tipHash());

    [v, r, s] = signHeader(b[26], 23, mRoot1, cPriv);
    await parsec.submitBlock(b[26], mRoot1, v, r, s);
    b[27] = blockHash(b[26], 23, mRoot1, v, r, s);

    // archive genesis
    [v, r, s] = signHeader(b[27], 24, mRoot1, cPriv);
    const receipt2 = await parsec.submitBlockAndPrune(b[27], mRoot1, v, r, s, [b[0]]);
    assert(receipt1.receipt.gasUsed > receipt2.receipt.gasUsed);
    assert(receipt2.logs[1].event == 'ArchiveBlock');
    b[28] = blockHash(b[27], 24, mRoot1, v, r, s);

    // claim rewards
    let bal1 = await token.balanceOf(c);
    await parsec.claimReward(b[10], [b[1], b[4], b[9]], [claimR, claimS, empty], claimV); 
    let bal2 = await token.balanceOf(c);
    assert(bal1.toNumber() < bal2.toNumber());

    let tip = await parsec.getTip(ops);
    assert.equal(b[28], tip[0]);
    assert.equal(4, tip[1]);

    // leave operator set, get stake back
    bal1 = await token.balanceOf(d);
    await parsec.payout(d);
    bal2 = await token.balanceOf(d);
    assert(bal1.toNumber() < bal2.toNumber());
  });

});