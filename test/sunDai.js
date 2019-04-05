/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

const SunDAI = artifacts.require('SunDAI');
const NativeToken = artifacts.require('NativeToken');
const DepositHandler = artifacts.require('DepositHandler');

contract('SunDAI', (accounts) => {

  let token;
  let dai;
  let bridge;

  before(async () => {
    dai = await NativeToken.new('DAI', 'dai', 18);
    token = await SunDAI.new(dai.address, bridge.address, '0x00444149', '0x00444149');
    
  });

  it('is mintable', async () => {
    assert.equal(await token.balanceOf(accounts[0]), 0);
    
    await token.mint(accounts[0], 200);
    
    assert.equal(await token.balanceOf(accounts[0]), 200);
  });

  it('is burnable', async () => {
    const balance = await token.balanceOf(accounts[0]);

    await token.burn(100);
    
    assert.equal(await token.balanceOf(accounts[0]), balance - 100);
  });

});