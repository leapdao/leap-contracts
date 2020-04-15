/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

const PaymentSplitter = artifacts.require('PaymentSplitter');

contract('PaymentSplitter', (accounts) => {

  let paymentSplitter;

  beforeEach(async () => {
    paymentSplitter = await PaymentSplitter.new();
  });

  it('is splitable', async () => {
    const balanceBefore = await web3.eth.getBalance(accounts[1]);
    await paymentSplitter.split([accounts[1], accounts[2]], [500, 500], {value: '100000000'});
    const balanceAfter = await web3.eth.getBalance(accounts[1]);
    assert(balanceAfter !== balanceBefore, "split not performed");
  });

  it('needs no splitting if 1 receiver', async () => {
    const balanceBefore = await web3.eth.getBalance(accounts[1]);
    await paymentSplitter.split([accounts[1]], [1], {value: '100000000'});
    const balanceAfter = await web3.eth.getBalance(accounts[1]);
    assert(balanceAfter !== balanceBefore, "split not performed");
  });

  it('needs no splitting if no receiver', async () => {
    const balanceBefore = await web3.eth.getBalance(accounts[1]);
    await paymentSplitter.split([accounts[1]], [1], {value: '0'});
    const balanceAfter = await web3.eth.getBalance(accounts[1]);
    assert.equal(balanceAfter, balanceBefore);
  });

  it('is splitable by 3', async () => {
    const balanceBefore = await web3.eth.getBalance(accounts[1]);
    await paymentSplitter.split([accounts[1], accounts[2], accounts[3]], [6, 6, 5], {value: '100000000'});
    const balanceAfter = await web3.eth.getBalance(accounts[1]);
    assert(balanceAfter !== balanceBefore, "split not performed");
  });

});