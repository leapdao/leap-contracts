import { keccak256 } from 'ethereumjs-util';
import { EVMRevert } from './helpers';

const ERC1949 = artifacts.require('../mocks/ERC1949.sol');

require('./helpers/setup');

contract('ERC1949', (accounts) => {
  let queenId;
  const creator = accounts[0];
  const workerData = '0x0101010101010101010101010101010101010101010101010101010101010101';
  let delegateToken;

  beforeEach(async () => {
    delegateToken = await ERC1949.new();
    const rsp = await delegateToken.mintDelegate(creator);
    queenId = rsp.logs[0].args.tokenId;
  });

  it('should allow delegate new worker', async () => {
    // check queenCounter
    const queenCounter = '0x0000000000000000000000000000000000000000000000000000000000000001';
    let rsp = await delegateToken.readData(queenId);
    assert.equal(rsp, queenCounter);

    // generate workerId
    const buffer = Buffer.alloc(64, 0);
    queenId.toBuffer().copy(buffer);
    buffer.writeUInt32BE(1, 60);
    const workerId = `0x${keccak256(buffer).toString('hex')}`;

    // delegate and check result
    rsp = await delegateToken.breed(workerId, creator, workerData);
    const mintedId = `0x${rsp.logs[1].args.tokenId.toString('hex')}`;
    assert.equal(workerId, mintedId);

    // check worker data
    const data = await delegateToken.readData(workerId);
    assert.equal(data, workerData);
  });

  it('should fail if delegate called by non-owner', async () => {
    await delegateToken.breed(123, creator, workerData, {from: accounts[1]}).should.be.rejectedWith(EVMRevert);
  });

});
