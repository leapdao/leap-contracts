const { promisify } = require('util');
const { ethGetBlock } = require('./web3');
const { duration } = require('./duration');

function advanceBlock () {
  return promisify(web3.currentProvider.send)({
    jsonrpc: '2.0',
    method: 'evm_mine',
  });
}

// Returns the time of the last mined block in seconds
async function latest () {
  const block = await ethGetBlock('latest');
  return block.timestamp;
}

// Increases ganache time by the passed duration in seconds
async function increase (durationSec) {
  if (durationSec < 0) throw Error(`Cannot increase time by a negative amount (${durationSec})`);

  await promisify(web3.currentProvider.send)({
    jsonrpc: '2.0',
    method: 'evm_increaseTime',
    params: [durationSec],
  });

  await advanceBlock();
}

/**
 * Beware that due to the need of calling two separate ganache methods and rpc calls overhead
 * it's hard to increase time precisely to a target point so design your test to tolerate
 * small fluctuations from time to time.
 *
 * @param target time in seconds
 */
async function increaseTo (target) {
  const now = (await latest());

  if (target < now) throw Error(`Cannot increase current time (${now}) to a moment in the past (${target})`);
  const diff = target - now;
  return increase(diff);
}

module.exports = {
  advanceBlock,
  latest,
  increase,
  increaseTo,
  duration,
};