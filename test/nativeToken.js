/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

const NativeToken = artifacts.require('NativeToken');

contract('NativeToken', (accounts) => {

  it('is mintable', async () => {
    const token = await NativeToken.deployed();
    assert.equal(await token.balanceOf(accounts[0]), 0);
    
    await token.mint(accounts[0], 200);
    
    assert.equal(await token.balanceOf(accounts[0]), 200);
  });

  it('is burnable', async () => {
    const token = await NativeToken.deployed();
    const balance = await token.balanceOf(accounts[0]);

    await token.burn(100);
    
    assert.equal(await token.balanceOf(accounts[0]), balance - 100);
  });

});