const PlasmaRoot = artifacts.require('./PlasmaRoot.sol');

contract('PlasmaRoot', (accounts) => {
  let plasmaRoot;

  before(async () => {
    plasmaRoot = await PlasmaRoot.new();
  });

  it('should have owner', async () => {
    const owner = await plasmaRoot.owner();
    assert.equal(owner, accounts[0]);
  });

  it('#submitBlock', async () => {
    const merkleRoot = 0x3133700000000000000000000000000000000000000000000000000000000000;

    await plasmaRoot.submitBlock(merkleRoot);

    assert.equal(await plasmaRoot.currentChildBlock(), 2);
    assert.equal(await plasmaRoot.lastParentBlock(), web3.eth.blockNumber);
    const childBlock = await plasmaRoot.childChain(1);
    assert.equal(childBlock[0], merkleRoot);
    assert.equal(childBlock[1], web3.eth.getBlock(web3.eth.blockNumber).timestamp);
  })

});
