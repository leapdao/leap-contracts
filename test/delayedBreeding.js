import utils from "ethereumjs-util";

const DelayedBreeder = artifacts.require('./mocks/DelayedBreeder.sol');

require('./helpers/setup');

contract('DelayedBreeder', (accounts) => {
  let dBreed;

  beforeEach(async () => {
    dBreed = await DelayedBreeder.new();
  });

  it('should allow breed worker', async () => {
    const rsp = await dBreed.mintQueen();
    const queenId = rsp.logs[0].args.tokenId;
    let queenData = await dBreed.readData(queenId);
    const workerId = utils.keccak256(queenId, queenData);
    await dBreed.breed(queenId, workerId, accounts[0]);

    // increase counter
    const breedCounter = utils.toBuffer(queenData).readUInt32BE(28);
    const buf = Buffer.alloc(32);
    buf.writeUInt32BE(breedCounter + 1, 28);
    await dBreed.writeData(queenId, utils.bufferToHex(buf));
    queenData = await dBreed.readData(queenId);
    assert.equal(queenData, utils.bufferToHex(buf));
  });

});
