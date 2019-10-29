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

  const amount = '100000000000000000000'; // 100 dai
  let dai;
  const leap = { address: accounts[3] };
  let colony;
  let bountyPayout;

  beforeEach(async () => {
    dai = await NativeToken.new('DAI', 'dai', 18);
    dai.mint(accounts[0], amount);
    colony = await Colony.new();
    bountyPayout = await BountyPayout.new(colony.address, dai.address, leap.address);
  });

  it('is payable', async () => {
    await dai.approve(bountyPayout.address, amount);
    await bountyPayout.payout(
      `0x${accounts[1].replace('0x', '')}00000000D02AB486CEDC0000`, // 15%
      `0x${accounts[2].replace('0x', '')}00000003860E639D80640000`, // 65%
      `0x${accounts[3].replace('0x', '')}00000001158E460913D00000`, // 20%
      '0x2f6c6561702d636f6e7472616374732f6973737565732f323337' // /leap-contracts/issues/237
    );
    assert.equal((await dai.balanceOf(accounts[1])).toString(10), '15000000000000000000');
    assert.equal((await dai.balanceOf(accounts[2])).toString(10), '65000000000000000000');
    assert.equal((await dai.balanceOf(accounts[3])).toString(10), '20000000000000000000');
  });

  it('is payable with rep only', async () => {
    await dai.approve(bountyPayout.address, amount);
    await bountyPayout.payoutNoReviewer(
      `0x${accounts[1].replace('0x', '')}00000000D02AB486CEDC0000`, // 15%
      `0x${accounts[2].replace('0x', '')}00000003860E639D80640001`, // 65% repOnly
      '0x2f6c6561702d636f6e7472616374732f6973737565732f323337' // /leap-contracts/issues/237
    );
    assert.equal((await dai.balanceOf(accounts[1])).toString(10), '15000000000000000000');
    assert.equal((await dai.balanceOf(accounts[2])).toString(10), '0');
  });

  it('is payable for delivery with review', async () => {
    await dai.approve(bountyPayout.address, amount);
    await bountyPayout.payoutReviewedDelivery(
      `0x${accounts[1].replace('0x', '')}00000000D02AB486CEDC0000`, // 15%
      `0x${accounts[2].replace('0x', '')}00000003860E639D80640000`, // 65% repOnly
      '0x2f6c6561702d636f6e7472616374732f6973737565732f323337' // /leap-contracts/issues/237
    );
    assert.equal((await dai.balanceOf(accounts[1])).toString(10), '15000000000000000000');
    assert.equal((await dai.balanceOf(accounts[2])).toString(10), '65000000000000000000');
  });

});