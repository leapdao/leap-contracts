/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import EVMRevert from './helpers/EVMRevert';

const NativeToken = artifacts.require('NativeToken');
const SunDAI = artifacts.require('SunDAI');

require('./helpers/setup');

contract('SunDAI', (accounts) => {

  let dai;
  let sunDai;
  let alice;
  let bob;
  let bridge;

  beforeEach(async () => {
    dai = await NativeToken.new('DAI', 'dai', 18);
    [alice, bob, bridge] = accounts;
    sunDai = await SunDAI.new(dai.address, bridge, '0x00444149', '0x00444149');
  });

  it('sunDAI is mintable on deposit if DAI approval given', async () => {
    // have some DAI
    await dai.mint(alice, 200);
    assert.equal(await dai.balanceOf(alice), 200);

    // calls executed by burner wallet on DAI => SunDAI conversion
    await dai.approve(sunDai.address, 200);
    await sunDai.transferFrom(alice, bridge, 200, {from: bridge}).should.be.fulfilled;
    
    // check custody of DAI and supply on sunDAI after deposit
    assert.equal(await dai.balanceOf(sunDai.address), 200);
    assert.equal(await dai.balanceOf(alice), 0);
    assert.equal(await sunDai.balanceOf(bridge), 200);
    assert.equal(await sunDai.balanceOf(alice), 0);
  });

  it('sunDAI deposit fails if DAI approval not given', async () => {
    // have some DAI
    await dai.mint(alice, 200);
    assert.equal(await dai.balanceOf(alice), 200);

    // calls executed by burner wallet on DAI => SunDAI conversion
    // not given: await dai.approve(sunDai.address, 200);
    await sunDai.transferFrom(alice, bridge, 200, {from: bridge}).should.be.rejectedWith(EVMRevert);
  });

  it('sunDAI deposit fails if TO different from MsgSender', async () => {
    // have some DAI
    await dai.mint(alice, 200);
    assert.equal(await dai.balanceOf(alice), 200);

    // calls executed by burner wallet on DAI => SunDAI conversion
    await dai.approve(sunDai.address, 200);
    await sunDai.transferFrom(alice, accounts[3], 200, {from: bridge}).should.be.rejectedWith(EVMRevert);
  });

  it('sunDAI is mintable and burnable', async () => {
    // have some DAI
    await dai.mint(bob, 200);
    assert.equal(await dai.balanceOf(bob), 200);

    // calls executed by burner wallet on DAI => SunDAI conversion
    await dai.approve(sunDai.address, 200, {from: bob});
    await sunDai.transferFrom(bob, bridge, 200, {from: bridge}).should.be.fulfilled;

    // mock exit by transfer, then burn
    await sunDai.transfer(bob, 200, {from: bridge});
    assert.equal(await sunDai.balanceOf(bob), 200);
    await sunDai.burnSender({from: bob});

    // check custody of DAI and supply on sunDAI after deposit
    assert.equal(await dai.balanceOf(sunDai.address), 0);
    assert.equal(await dai.balanceOf(bob), 200);
    assert.equal(await sunDai.balanceOf(bob), 0);
  });

  it('sunDAI is depositable without minting if balance sufficient', async () => {
    // mock exit by mint, then burn
    await sunDai.mint(alice, 200);
    await sunDai.transferFrom(alice, bridge, 200, {from: bridge}).should.be.fulfilled;

    // check custody of DAI and supply on sunDAI after deposit
    assert.equal(await dai.balanceOf(sunDai.address), 0);
    assert.equal(await dai.balanceOf(alice), 0);
    assert.equal(await sunDai.balanceOf(bridge), 200);
    assert.equal(await sunDai.balanceOf(alice), 0);
  });

  it('sunDAI is half depositable half mintable', async () => {
    // mock exit by mint, then burn
    await sunDai.mint(alice, 200);
    await dai.mint(alice, 200);
    await dai.approve(sunDai.address, 200);
    await sunDai.transferFrom(alice, bridge, 400, {from: bridge}).should.be.fulfilled;

    // check custody of DAI and supply on sunDAI after deposit
    assert.equal(await dai.balanceOf(sunDai.address), 200);
    assert.equal(await dai.balanceOf(alice), 0);
    assert.equal(await sunDai.balanceOf(bridge), 400);
    assert.equal(await sunDai.balanceOf(alice), 0);
  });

  it('sunDAI transferFrom should work if approved', async () => {
    // mock exit by mint, then burn
    await sunDai.mint(alice, 200);

    await sunDai.transferFrom(alice, bob, 200, {from: bob}).should.be.rejectedWith(EVMRevert);
    assert.equal(await sunDai.balanceOf(alice), 200);
    assert.equal(await sunDai.balanceOf(bob), 0);

    await sunDai.approve(bob, 200);
    await sunDai.transferFrom(alice, bob, 200, {from: bob}).should.be.fulfilled;
    assert.equal(await sunDai.balanceOf(alice), 0);
    assert.equal(await sunDai.balanceOf(bob), 200);
  });

  it('sunDAI transferFrom should work if approved', async () => {
    // mock exit by mint, then burn
    await sunDai.mint(alice, 200);

    await sunDai.transferFrom(alice, bob, 200, {from: bob}).should.be.rejectedWith(EVMRevert);
    assert.equal(await sunDai.balanceOf(alice), 200);
    assert.equal(await sunDai.balanceOf(bob), 0);

    await sunDai.approve(bob, 200);
    await sunDai.transferFrom(alice, bob, 200, {from: bob}).should.be.fulfilled;
    assert.equal(await sunDai.balanceOf(alice), 0);
    assert.equal(await sunDai.balanceOf(bob), 200);
  });

  it('sunDAI collateral is burnable by minter', async () => {
    // have some DAI
    await dai.mint(bob, 200);
    assert.equal(await dai.balanceOf(bob), 200);

    // calls executed by burner wallet on DAI => SunDAI conversion
    await dai.approve(sunDai.address, 200, {from: bob});
    await sunDai.transferFrom(bob, bridge, 200, {from: bridge}).should.be.fulfilled;

    // mock exit by transfer, then burn
    await sunDai.mint(alice, 200);
    assert.equal(await sunDai.balanceOf(alice), 200);
    await sunDai.burnSender();

    assert.equal(await dai.balanceOf(sunDai.address), 0);
    assert.equal(await dai.balanceOf(alice), 200);
    assert.equal(await sunDai.balanceOf(alice), 0);
    assert.equal(await sunDai.balanceOf(bridge), 200);
  });

});