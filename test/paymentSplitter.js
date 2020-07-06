/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

const PaymentSplitter = artifacts.require('PaymentSplitter');
const NativeToken = artifacts.require('NativeToken');
const { BN } = web3.utils;

contract('PaymentSplitter', (accounts) => {

  let paymentSplitter;
  let token;

  before(async () => {
    token = await NativeToken.new('SIM', 'sim', 18);
  });

  beforeEach(async () => {
    paymentSplitter = await PaymentSplitter.new();
  });

  it('is splitable', async () => {
    const balanceBefore = await web3.eth.getBalance(accounts[1]);
    await paymentSplitter.split([accounts[1], accounts[2]], [500, 500], {value: '100000000'});
    const balanceAfter = await web3.eth.getBalance(accounts[1]);
    assert.equal(new BN(balanceAfter).sub(new BN(balanceBefore)).toNumber(), 50000000, "split not performed");
  });

  it('needs no splitting if 1 receiver', async () => {
    const balanceBefore = await web3.eth.getBalance(accounts[1]);
    // testing big amounts here: 10 ETH
    await paymentSplitter.split([accounts[1]], [1], {value: web3.utils.toWei('10')});
    const balanceAfter = await web3.eth.getBalance(accounts[1]);
    assert.equal(new BN(balanceAfter).sub(new BN(balanceBefore)).toString(), web3.utils.toWei('10'), "payment not performed");
  });

  it('needs no splitting if no value to split', async () => {
    const balanceBefore = await web3.eth.getBalance(accounts[1]);
    await paymentSplitter.split([accounts[1]], [1], {value: '0'});
    const balanceAfter = await web3.eth.getBalance(accounts[1]);
    assert.equal(balanceAfter, balanceBefore);
  });

  it('is splitable by 3', async () => {
    const balanceBefore = await web3.eth.getBalance(accounts[3]);
    await paymentSplitter.split([accounts[1], accounts[2], accounts[3]], [6, 6, 5], {value: '100000000'});
    const balanceAfter = await web3.eth.getBalance(accounts[3]);
    // (6/17*100000000) = 35294117.6471 => solidity rounds to 35294117
    // (5/17*100000000) = 29411764.7059 => solidity rounds to 29411764
    // but we expect 29411766, 2 more wei, which is flushing the rest from the contract
    assert.equal(new BN(balanceAfter).sub(new BN(balanceBefore)).toNumber(), 29411766, "split not performed");
    // make sure no ether left in contract
    const contractBalance = await web3.eth.getBalance(paymentSplitter.address);
    assert.equal(contractBalance, '0', 'flush failed');
  });

  it('erc20 is splitable', async () => {
    await token.mint(accounts[0], 1000);
    await token.approve(paymentSplitter.address, 1000);
    const balanceBefore = await token.balanceOf(accounts[1]);
    await paymentSplitter.splitERC20([accounts[1], accounts[2]], [500, 500], token.address);
    const balanceAfter = await token.balanceOf(accounts[1]);
    assert.equal(new BN(balanceAfter).sub(new BN(balanceBefore)).toNumber(), 500, "split not performed");
  });

});
