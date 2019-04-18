
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import { bufferToHex, hashPersonalMessage } from "ethereumjs-util";
import BN from 'bn.js';
import { BigInt, equal } from 'jsbi';
import { Period, Block, Tx, Input, Output, Outpoint, Type } from 'leap-core';
import chai from 'chai';

const ethers = require('ethers');

const TxMock = artifacts.require('./mocks/TxMock.sol');
const EMPTY =  '0x0000000000000000000000000000000000000000000000000000000000000000';

chai.use(require('chai-as-promised')).should();

export const provider =
  typeof web3 !== 'undefined' ? new ethers.providers.Web3Provider(web3.currentProvider) : undefined;
export const wallets = [];

function toInt(str) {
  // const buf = Buffer.from(str.replace('0x', ''), 'hex');
  // return new BN(buf);
  return BigInt(str);
}

function fromInt(num) {
  return new BN(num).toBuffer('be', 32);
}

function checkParse(rsp, txn) {
  // transaction header
  assert.equal(rsp.txType, txn.type);
  if (txn.type === Type.DEPOSIT) {
    // eslint-disable-next-line no-param-reassign
    txn.inputs = [{prevout: {hash: fromInt(txn.options.depositId)}}];
  }
  assert.equal(rsp.ins.length, txn.inputs.length);
  assert.equal(rsp.outs.length, txn.outputs.length);
  // inputs
  for (let i = 0; i < txn.inputs.length; i++) {
    assert.equal(rsp.ins[i].outpoint[0], `0x${txn.inputs[i].prevout.hash.toString('hex')}`);
    assert.equal(toInt(rsp.ins[i].outpoint[1]), i); // output position
    if (txn.type === Type.TRANSFER) {
      assert.equal(rsp.ins[i].r, `0x${txn.inputs[i].r.toString('hex')}`);
      assert.equal(rsp.ins[i].s, `0x${txn.inputs[i].s.toString('hex')}`);
      assert.equal(rsp.ins[i].v, txn.inputs[i].v);
    } else if (txn.type === Type.SPEND_COND) {
      assert.equal(rsp.ins[i].msgData, `0x${txn.inputs[i].msgData.toString('hex')}`);
      assert.equal(rsp.ins[i].script, `0x${txn.inputs[i].script.toString('hex')}`);
    } else {
      assert.equal(rsp.ins[i].r, EMPTY);
      assert.equal(rsp.ins[i].s, EMPTY);
      assert.equal(toInt(rsp.ins[i].v), 0);
    }
  }
  // outputs
  for (let i = 0; i < txn.outputs.length; i++) {
    assert(equal(toInt(rsp.outs[i].value), txn.outputs[i].value));
    assert.equal(toInt(rsp.outs[i].color), txn.outputs[i].color);
    assert.equal(rsp.outs[i].owner, txn.outputs[i].address);
    assert.equal(rsp.outs[i].stateRoot, txn.outputs[i].isNST() ? txn.outputs[i].data : EMPTY); // storage root
  }
}

export async function deployContract(truffleContract, ...args) {
  const factory = new ethers.ContractFactory(
    truffleContract.abi,
    truffleContract.bytecode,
    wallets[0]
  );
  const contract = await factory.deploy(...args);

  await contract.deployed();
  return contract;
}

contract('TxLib', (accounts) => {
  const alice = accounts[0];
  const alicePriv = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';
  const bob = accounts[1];
  const bobPriv = '0x7bc8feb5e1ce2927480de19d8bc1dc6874678c016ae53a2eec6a6e9df717bfac';
  const charlie = accounts[2];
  const prevTx = '0x7777777777777777777777777777777777777777777777777777777777777777';
  const value = 99000000;
  const color = 1337;
  const nftTokenId = '3378025004445879814397';
  const nftColor = 32769;
  const nstColor = 49153;
  const slotId = 4;
  const storageRoot = '0x0101010101010101010101010101010101010101010101010101010101010101';
  let wallet = new ethers.Wallet(alicePriv, provider);
  wallets.push(wallet);
  wallet = new ethers.Wallet(bobPriv, provider);
  wallets.push(wallet);

  describe('Parser', () => {
    let txLib;

    before(async () => {
      txLib = await deployContract(TxMock);
    });

    describe('Deposit', () => {

      it('should allow to parse deposit', async () => {
        const deposit = Tx.deposit(12, value, bob, color);
        const block = new Block(32);
        block.addTx(deposit);
        const period = new Period(alicePriv, [block]);
        period.setValidatorData(slotId, alice);
        const proof = period.proof(deposit);

        const rsp = await txLib.parse(proof).should.be.fulfilled;
        checkParse(rsp, deposit);
      });

      it('should allow to parse NFT deposit', async () => {
        const deposit = Tx.deposit(12, nftTokenId, bob, nftColor);
        const block = new Block(32);
        block.addTx(deposit);
        const period = new Period(alicePriv, [block]);
        period.setValidatorData(slotId, alice);
        const proof = period.proof(deposit);

        const rsp = await txLib.parse(proof).should.be.fulfilled;
        checkParse(rsp, deposit);
      });

      it('should allow to parse NST deposit', async () => {
        const deposit = Tx.deposit(12, nftTokenId, bob, nstColor, storageRoot);
        const block = new Block(32);
        block.addTx(deposit);
        const period = new Period(alicePriv, [block]);
        period.setValidatorData(slotId, alice);
        const proof = period.proof(deposit);

        const rsp = await txLib.parse(proof).should.be.fulfilled;
        checkParse(rsp, deposit);
      });
    });

    describe('Transfer', () => {

      it('should parse single input and output', async () => {
        const transfer = Tx.transfer(
          [new Input(new Outpoint(prevTx, 0))],
          [new Output(value, bob, color)],
        );
        transfer.sign([alicePriv]);
        const block = new Block(32);
        block.addTx(transfer);
        const period = new Period(alicePriv, [block]);
        period.setValidatorData(slotId, alice);
        const proof = period.proof(transfer);

        const rsp = await txLib.parse(proof).should.be.fulfilled;
        checkParse(rsp, transfer);
        const outpoint = transfer.inputs[0].prevout;
        const utxoId = await txLib.getUtxoId(outpoint.index, `0x${outpoint.hash.toString('hex')}`);
        assert.equal(utxoId, outpoint.getUtxoId());
      });

      it('should parse 2 inputs and 2 outputs', async () => {
        const transfer = Tx.transfer([
          new Input(new Outpoint(prevTx, 0)),
          new Input(new Outpoint(prevTx, 1)),
        ],[
          new Output(value / 2, alice, color),
          new Output(value / 2, bob, color),
        ]);
        transfer.sign([bobPriv, alicePriv]);
        const block = new Block(32);
        block.addTx(transfer);
        const period = new Period(alicePriv, [block]);
        period.setValidatorData(slotId, alice);
        const proof = period.proof(transfer);

        const rsp = await txLib.parse(proof).should.be.fulfilled;
        checkParse(rsp, transfer);
      });

      it('should parse 1 inputs and 3 outputs', async () => {
        const transfer = Tx.transfer([
          new Input(new Outpoint(prevTx, 0)),
        ],[
          new Output(value / 3, alice, color),
          new Output(value / 3, bob, color),
          new Output(value / 3, charlie, color),
        ]);
        transfer.sign([bobPriv]);
        const block = new Block(32);
        block.addTx(transfer);
        const period = new Period(alicePriv, [block]);
        period.setValidatorData(slotId, alice);
        const proof = period.proof(transfer);

        const rsp = await txLib.parse(proof).should.be.fulfilled;
        checkParse(rsp, transfer);
      });

      it('should parse NFT transfers', async () => {
        const transfer = Tx.transfer(
          [new Input(new Outpoint(prevTx, 0))],
          [new Output(nftTokenId, bob, nftColor)],
        );
        transfer.sign([alicePriv]);
        const block = new Block(32);
        block.addTx(transfer);
        const period = new Period(alicePriv, [block]);
        period.setValidatorData(slotId, alice);
        const proof = period.proof(transfer);

        const rsp = await txLib.parse(proof).should.be.fulfilled;
        checkParse(rsp, transfer);
      });

      it('should parse NST transfer with multiple outputs', async () => {
        const transfer = Tx.transfer(
          [new Input(new Outpoint(prevTx, 0))],
          [new Output(nftTokenId, bob, nstColor, storageRoot),
           new Output(value, bob, color)],
        );
        transfer.sign([alicePriv]);
        const block = new Block(32);
        block.addTx(transfer);
        const period = new Period(alicePriv, [block]);
        period.setValidatorData(slotId, alice);
        const proof = period.proof(transfer);

        const rsp = await txLib.parse(proof).should.be.fulfilled;
        checkParse(rsp, transfer);
      });
    });

    describe('Spending Condition', () => {

      it('should parse single input and output', async () => {
        // create simple spending condition
        const condition = Tx.spendCond(
          [new Input({
            prevout: new Outpoint(prevTx, 0),
            script: '0x123456',
          })], [new Output(value, alice, color)],
        );
        condition.inputs[0].setMsgData('0xabcdef');

        const block = new Block(32);
        block.addTx(condition);
        const period = new Period(alicePriv, [block]);
        period.setValidatorData(slotId, alice);
        const proof = period.proof(condition);

        const rsp = await txLib.parse(proof).should.be.fulfilled;
        checkParse(rsp, condition);
        const outpoint = condition.inputs[0].prevout;
        const utxoId = await txLib.getUtxoId(outpoint.index, `0x${outpoint.hash.toString('hex')}`);
        assert.equal(utxoId, outpoint.getUtxoId());
      });

      it('should parse 2 inputs and 2 outputs', async () => {
        const condition = Tx.spendCond(
          [new Input({
            prevout: new Outpoint(prevTx, 0),
            script: '0x123456',
          }),
          new Input({
            prevout: new Outpoint(prevTx, 1),
            script: '0x7890ab',
          }),
        ],[
          new Output(value / 2, alice, color),
          new Output(value / 2, bob, color),
        ]);
        condition.inputs[0].setMsgData('0xabcdef');
        condition.inputs[1].setMsgData('0xfedcba');

        const block = new Block(32);
        block.addTx(condition);
        const period = new Period(alicePriv, [block]);
        period.setValidatorData(slotId, alice);
        const proof = period.proof(condition);

        const rsp = await txLib.parse(proof).should.be.fulfilled;
        checkParse(rsp, condition);
      });

      it('should parse 1 inputs and 3 outputs', async () => {
        const condition = Tx.spendCond([
          new Input({
            prevout: new Outpoint(prevTx, 0),
            script: '0x123456',
          }),
        ],[
          new Output(value / 3, alice, color),
          new Output(value / 3, bob, color),
          new Output(value / 3, charlie, color),
        ]);
        condition.inputs[0].setMsgData('0xabcdef');

        const block = new Block(32);
        block.addTx(condition);
        const period = new Period(alicePriv, [block]);
        period.setValidatorData(slotId, alice);
        const proof = period.proof(condition);

        const rsp = await txLib.parse(proof).should.be.fulfilled;
        checkParse(rsp, condition);
      });
    });
  });

  describe('Utils test', () => {
    let txLib;

    before(async () => {
      txLib = await deployContract(TxMock);
    });

    it('should allow to verify proof', async () => {
      const blocks = [];

      for (let i = 0; i < 32; i ++) {
        const block = new Block(i).addTx(Tx.deposit(i, value, bob, color));
        blocks.push(block);
      }
      const period = new Period(alicePriv, blocks);
      period.setValidatorData(slotId, alice);
      const proof = period.proof(Tx.deposit(12, value, bob, color));
      await txLib.validateProof(proof).should.be.fulfilled;
    });

    it('should allow to verify proof with always 2 txnns', async () => {
      const blocks = [];
      let block;
      for (let i = 0; i < 32; i ++) {
        block = new Block(i).addTx(Tx.deposit(i, value, bob, color)).addTx(Tx.deposit(100 + i, value, bob, color));
        blocks.push(block);
      }
      const period = new Period(alicePriv, blocks);
      period.setValidatorData(slotId, alice);
      const proof = period.proof(Tx.deposit(12, value, bob, color));
      await txLib.validateProof(proof).should.be.fulfilled;
    });

    it('should allow to get sigHash with 1 input', async () => {
      const transfer = Tx.transfer(
        [new Input(new Outpoint(prevTx, 0))],
        [new Output(value, bob, color)],
      );
      transfer.sign([alicePriv]);
      const rsp = await txLib.getSigHash(transfer.hex()).should.be.fulfilled;
      assert.equal(rsp, bufferToHex(hashPersonalMessage(transfer.sigDataBuf())));
    });
    it('should allow to get sigHash with 2 input and 2 outputs', async () => {
      const transfer = Tx.transfer(
        [new Input(new Outpoint(prevTx, 0)), new Input(new Outpoint(prevTx, 1))],
        [new Output(value / 2, bob, color), new Output(value / 2, bob, color)],
      );
      transfer.sign([alicePriv, alicePriv]);
      const rsp = await txLib.getSigHash(transfer.hex()).should.be.fulfilled;
      assert.equal(rsp, bufferToHex(hashPersonalMessage(transfer.sigDataBuf())));
    });
  });
});
