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
    //const op = await parsec.operators(accounts[0]);
    await parsec.submitBlock(1, 0x00);
    await parsec.submitBlock(2, 0x01);
    await parsec.submitBlock(3, 0x02);
    const tip = await parsec.getTip();
    console.log(tip);
  });

});