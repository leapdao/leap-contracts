import { keccak256 } from 'ethereumjs-util';
import { EVMRevert } from './helpers';

const ERC1949BreedMock = artifacts.require('../mocks/ERC1949BreedMock.sol');

require('./helpers/setup');

contract('ERC1949', (accounts) => {
  const firstTokenId = 100;
  const creator = accounts[0];
  const queen = '0x0000000000000000000000000000000000000000000000000000000000000001';
  const data = '0x0101010101010101010101010101010101010101010101010101010101010101';
  let breedToken;

  beforeEach(async () => {
    breedToken = await ERC1949BreedMock.new();
    await breedToken.mint(creator, firstTokenId, queen);
  });

  it('should allow breed new worker', async () => {
    let rsp = await breedToken.readData(firstTokenId);
    assert.equal(rsp, queen);
    rsp = await breedToken.breed(firstTokenId, accounts[0], data);

    // create workerId
    const buffer = Buffer.alloc(64, 0);
    buffer.writeUInt32BE(firstTokenId, 28);
    buffer.writeUInt32BE(1, 60);
    const predictedId = keccak256(buffer).toString('hex');
    const mintedId = rsp.logs[1].args.tokenId.toString('hex');
    assert.equal(predictedId, mintedId);
    const workerData = await breedToken.readData(`0x${predictedId}`);
    assert.equal(workerData, data);
  });

  it('should fail if breed called by non-owner', async () => {
    await breedToken.breed(firstTokenId, accounts[0], data, {from: accounts[1]}).should.be.rejectedWith(EVMRevert);
  });

});
