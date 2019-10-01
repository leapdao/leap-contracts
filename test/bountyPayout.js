/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

const NativeToken = artifacts.require('NativeToken');
const BountyPayout = artifacts.require('BountyPayout');
const Colony = artifacts.require('Colony');

contract('BountyPayout', (accounts) => {

  const payer = accounts[0];
  const amount = '100000000000000000000'; // 100 dai
  let dai;
  let leap = { address: accounts[1] };
  let colony;
  let bountyPayout;

  before(async () => {
    dai = await NativeToken.new('DAI', 'dai', 18);
    dai.mint(payer, amount);
    colony = await Colony.new();
    bountyPayout = await BountyPayout.new(payer, colony.address, dai.address, leap.address);
  });

  it('is payable', async () => {
    await dai.approve(bountyPayout.address, amount);
    await bountyPayout.payout(
      accounts[1],
      '15000000000000000000', // 15%
      accounts[2],
      '65000000000000000000', // 65%
      accounts[3],
      '20000000000000000000', // 20%
      '0x2f6c6561702d636f6e7472616374732f6973737565732f323337' // /leap-contracts/issues/237
    );
    assert.equal((await dai.balanceOf(accounts[1])).toString(10), '15000000000000000000');
    assert.equal((await dai.balanceOf(accounts[2])).toString(10), '65000000000000000000');
    assert.equal((await dai.balanceOf(accounts[3])).toString(10), '20000000000000000000');
  });

});