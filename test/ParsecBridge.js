const ParsecBridge = artifacts.require('./ParsecBridge.sol');
const SimpleToken = artifacts.require('SimpleToken');

contract('Parsec', (accounts) => {
  let parsec;
  let token;

  before(async () => {
    token = await SimpleToken.new();
  });  

  beforeEach(async () => {
    parsec = await ParsecBridge.new(token.address, 0);
  });

  it('should allow to join and submit block', async () => {
    // initialize contract
    const ts = await token.totalSupply();
    await token.approve(parsec.address, ts);
    await parsec.join(ts.div(100));
    let tip = await parsec.tipHash();
    await parsec.submitBlock(tip, 0x0a);
    tip = await parsec.tipHash();
    await parsec.submitBlock(tip, 0x0b);
    tip = await parsec.tipHash();
    await parsec.submitBlock(tip, 0x0c);
    tip = await parsec.getTip();
    assert.equal(tip[1], 3);
    assert.equal(tip[3], accounts[0]);
  });

});