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
  let parsec;
  let token;

  before(async () => {
    token = await SimpleToken.new();
  });  

  beforeEach(async () => {
    parsec = await ParsecBridge.new(token.address, 0);
  });

  //                / -> B03
  // GB -> B01 -> B02 -> B04 -> B07 -> B08 -> B09 -> B10 -> B11 -> B12 -> B13 -> B14 -> B15
  //                \ -> B05 -> B06 -> B16
  it('should allow to join and submit block', async () => {
    // initialize contract
    const ts = await token.totalSupply();
    await token.approve(parsec.address, ts);
    await parsec.join(ts.div(100));
    const GB = await parsec.tipHash();


    // 2 blocks in line
    await parsec.submitBlock(GB, mRoot1);
    const B01 = hash(GB, 1, mRoot1);
    assert.equal(B01, await parsec.tipHash());
    
    await parsec.submitBlock(B01, mRoot1);
    const B02 = hash(B01, 2, mRoot1);
    assert.equal(B02, await parsec.tipHash());

    
    // 3 blocks in paralel
    await parsec.submitBlock(B02, mRoot0);
    const B03 = hash(B02, 3, mRoot0);
    assert.equal(B03, await parsec.tipHash());

    await parsec.submitBlock(B02, mRoot1);
    const B04 = hash(B02, 3, mRoot1);
    
    await parsec.submitBlock(B02, mRoot2);
    const B05 = hash(B02, 3, mRoot2);

    // 2 blocks in paralel
    await parsec.submitBlock(B05, mRoot2);
    const B06 = hash(B05, 4, mRoot2);
    assert.equal(B06, await parsec.tipHash());

    await parsec.submitBlock(B04, mRoot1);
    const B07 = hash(B04, 4, mRoot1);

    // 2 blocks in paralel
    await parsec.submitBlock(B07, mRoot1);
    const B08 = hash(B07, 5, mRoot1);
    assert.equal(B08, await parsec.tipHash());

    await parsec.submitBlock(B06, mRoot1);
    const B16 = hash(B06, 5, mRoot1);

    // more blocks in line
    await parsec.submitBlock(B08, mRoot1);
    const B09 = hash(B08, 6, mRoot1);
    assert.equal(B09, await parsec.tipHash());

    await parsec.submitBlock(B09, mRoot1);
    const B10 = hash(B09, 7, mRoot1);
    assert.equal(B10, await parsec.tipHash());

    await parsec.submitBlock(B10, mRoot1);
    const B11 = hash(B10, 8, mRoot1);
    assert.equal(B11, await parsec.tipHash());

    await parsec.submitBlock(B11, mRoot1);
    const B12 = hash(B11, 9, mRoot1);
    assert.equal(B12, await parsec.tipHash());

    const receipt1 = await parsec.submitBlock(B12, mRoot1);
    const B13 = hash(B12, 10, mRoot1);
    assert.equal(B13, await parsec.tipHash());

    // test pruning
    assert.equal((await parsec.getBranchCount(B02)).toNumber(), 3);
    const receipt2 = await parsec.submitBlock(B13, mRoot1); // <- this call is pruning
    assert.equal((await parsec.getBranchCount(B02)).toNumber(), 1);
    assert(receipt1.receipt.gasUsed > receipt2.receipt.gasUsed);
    const B14 = hash(B13, 11, mRoot1);
    assert.equal(B14, await parsec.tipHash());

    // prune orphans
    const receipt3 = await parsec.submitBlockAndPrune(B14, mRoot1, [B06, B16]); 
    assert(receipt1.receipt.gasUsed > receipt3.receipt.gasUsed);
    const B15 = hash(B14, 12, mRoot1);
    assert.equal(B15, await parsec.tipHash());

    let tip = await parsec.getTip();
    assert.equal(tip[1].toNumber(), 12);
    assert.equal(tip[3], accounts[0]);
  });

});