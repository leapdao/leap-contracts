/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

const NativeToken = artifacts.require('NativeToken');
const QuadraticMeetings = artifacts.require('QuadraticMeetings');

contract('Quadratic Meetings', (accounts) => {

  const funder = accounts[0];
  const amount = '100000000000000000000'; // 100 dai
  let dai;
  let meeting;

  before(async () => {
    dai = await NativeToken.new('DAI', 'dai', 18);
    dai.mint(funder, amount);
    meeting = await QuadraticMeetings.new(dai.address, accounts[1], accounts[2], funder, 0);
  });

  it('is payable', async () => {
    await dai.approve(meeting.address, amount);
    await meeting.payout({from: accounts[1]});
    assert.equal((await dai.balanceOf(accounts[1])).toString(10), '15000000000000000000');
  });

});