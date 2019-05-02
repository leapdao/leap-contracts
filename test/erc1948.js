const ERC1948 = artifacts.require('./ERC1948.sol');

require('./helpers/setup');

contract('ERC1948', (accounts) => {
  const firstTokenId = 100;
  const creator = accounts[0];
  const empty = '0x0000000000000000000000000000000000000000000000000000000000000000';
  const data = '0x0101010101010101010101010101010101010101010101010101010101010101';
  let dataToken;

  beforeEach(async () => {
    dataToken = await ERC1948.new();
    await dataToken.mint(creator, firstTokenId);
  });

  it('should allow read write read', async () => {
    let rsp = await dataToken.readData(firstTokenId);
    assert.equal(rsp, empty);
    await dataToken.writeData(firstTokenId, data);
    rsp = await dataToken.readData(firstTokenId);
    assert.equal(rsp, data);
  });

});
