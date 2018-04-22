import utils from 'ethereumjs-util';
import assertRevert from './helpers/assertRevert';
import { Tx, Block } from 'Parsec-lib';
const ParsecBridge = artifacts.require('./ParsecBridge.sol');
const SimpleToken = artifacts.require('SimpleToken');

contract('Parsec Withdraw', (accounts) => {
  const blockReward = 5000000;
  const empty = '0x0000000000000000000000000000000000000000000000000000000000000000';
  const c = accounts[0];  // operator charlie, stake: 4 * ts / epochLength
  const cPriv = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';
  const d = accounts[1];  // operator danie,   stake: 1 * ts / epochLength
  const dPriv = '0x7bc8feb5e1ce2927480de19d8bc1dc6874678c016ae53a2eec6a6e9df717bfac';
  const e = accounts[2];  // operator eric,    stake: 3 * ts / epochLength
  const ePriv = '0x94890218f2b0d04296f30aeafd13655eba4c5bbf1770273276fee52cbe3f2cb4';
  
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
    parsec = await ParsecBridge.new(token.address, 0, 8, blockReward, 0);
    b[0] = await parsec.tipHash();
    epochLength = await parsec.epochLength();
    totalSupply = await token.totalSupply();
  });  

  //
  // b[0] -> b[1,c]
  //
  it('should allow to exit transfer', async () => {
    await token.approve(parsec.address, totalSupply, {from: c});
    await parsec.join(totalSupply.div(epochLength).mul(4), {from: c});

    const deposit = new Tx().coinbase(blockReward, c);
    let transfer = new Tx(6).transfer([{prevTx: deposit.hash(), outPos: 0}], [{ value: blockReward, addr: parsec.address}]);
    transfer = transfer.sign([cPriv]);
    let block = new Block(b[0], 1).addTx(deposit).addTx(transfer);
    await parsec.submitBlock(b[0], block.merkleRoot(), ...block.sign(cPriv));
    b[1] = block.hash();
    assert.equal(b[1], await parsec.tipHash());

    const proof = block.proof(transfer.buf(), 1, [deposit.hash()]);
    const bal1 = await token.balanceOf(c);
    await parsec.withdrawBurn(proof);
    const bal2 = await token.balanceOf(c);
    console.log(bal1.toNumber(), bal2.toNumber());
    assert(bal1.toNumber() < bal2.toNumber());
  });

});