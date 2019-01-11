
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

const NativeToken = artifacts.require('NativeToken');

contract('NativeToken', (accounts) => {

  describe('Test', () => {
    let token;

    it('can burn tokens', async () => {
      token = await NativeToken.new('0x534d54', '0x534d54', 18);
      await token.mint(accounts[0], 200);
      await token.burn(100);
      const bal = await token.balanceOf(accounts[0]);
      assert.equal(bal, 100);
    });
  });

});