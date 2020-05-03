
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import { Tx, Input, Output, Outpoint, Block } from 'leap-core';

require('./helpers/setup');

const Bridge = artifacts.require('RollupBridge');
const AdminableProxy = artifacts.require('AdminableProxy');

contract('Rollup-Bridge', (accounts) => {
  const bob = accounts[1];
  const alicePriv = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';

  describe('Test', () => {
    let impl;
    let bridge;
    let proxy;
    const parentBlockInterval = 0;

    beforeEach(async () => {
      impl = await Bridge.new();
      let data = impl.contract.methods.initialize(parentBlockInterval).encodeABI();
      proxy = await AdminableProxy.new(impl.address, data, {from: accounts[2]});
      bridge = await Bridge.at(proxy.address);
      data = await impl.contract.methods.setOperator(accounts[0]).encodeABI();
      await proxy.applyProposal(data, {from: accounts[2]});
    });

    describe('Submit Plasma Period', async () => {
      it('has gas cost of 95400 for single period', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const newPeriodHash = '0x0100000000000000000000000000000000000000000000000000000000000000';

        const rsp = await bridge.submitPeriod(prevPeriodHash, newPeriodHash).should.be.fulfilled;
        assert.equal(rsp.receipt.gasUsed, 95400);

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });
    });

    describe('Submit Rollup Period', async () => {
      it('has gas cost of 103102 for single tx', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const outHash = '0x0100000000000000000000000000000000000000000000000000000000000001';
        const newPeriodHash = '0x0200000000000000000000000000000000000000000000000000000000000002';

        const transfer = Tx.transfer(
          [new Input(new Outpoint(outHash, 0))],
          [new Output(50, bob)]
        ).sign([alicePriv]);

        const txs = [];
        txs.push(transfer);

        const block = txs.reduce(
          (b, tx) => b.addTx(tx),
          new Block(33)
        );

        const rsp = await bridge.submitPeriodWithData(prevPeriodHash, newPeriodHash, block.hex()).should.be.fulfilled;
        assert.equal(rsp.receipt.gasUsed, 103102);

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });

      it('has gas cost of 738140 for 2 txns', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const outHash = '0x0100000000000000000000000000000000000000000000000000000000000001';
        const newPeriodHash = '0x0200000000000000000000000000000000000000000000000000000000000002';

        const txs = [];
        for (let i = 0; i < 2; i++) {
          txs.push(Tx.transfer(
            [new Input(new Outpoint(outHash, 0))],
            [new Output(50 + i, bob)]
          ).sign([alicePriv]));
        }

        const block = txs.reduce(
          (b, tx) => b.addTx(tx),
          new Block(33)
        );
        

        const rsp = await bridge.submitPeriodWithData(prevPeriodHash, newPeriodHash, block.hex()).should.be.fulfilled;
        console.log(rsp.receipt.gasUsed);
        // assert.equal(rsp.receipt.gasUsed, 738140);

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });

      it('has gas cost of 738140 for 5 txns', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const outHash = '0x0100000000000000000000000000000000000000000000000000000000000001';
        const newPeriodHash = '0x0200000000000000000000000000000000000000000000000000000000000002';

        const txs = [];
        for (let i = 0; i < 5; i++) {
          txs.push(Tx.transfer(
            [new Input(new Outpoint(outHash, 0))],
            [new Output(50 + i, bob)]
          ).sign([alicePriv]));
        }

        const block = txs.reduce(
          (b, tx) => b.addTx(tx),
          new Block(33)
        );
        

        const rsp = await bridge.submitPeriodWithData(prevPeriodHash, newPeriodHash, block.hex()).should.be.fulfilled;
        console.log(rsp.receipt.gasUsed);
        // assert.equal(rsp.receipt.gasUsed, 738140);

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });

      it('has gas cost of 738140 for 10 txns', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const outHash = '0x0100000000000000000000000000000000000000000000000000000000000001';
        const newPeriodHash = '0x0200000000000000000000000000000000000000000000000000000000000002';

        const txs = [];
        for (let i = 0; i < 10; i++) {
          txs.push(Tx.transfer(
            [new Input(new Outpoint(outHash, 0))],
            [new Output(50 + i, bob)]
          ).sign([alicePriv]));
        }

        const block = txs.reduce(
          (b, tx) => b.addTx(tx),
          new Block(33)
        );
        

        const rsp = await bridge.submitPeriodWithData(prevPeriodHash, newPeriodHash, block.hex()).should.be.fulfilled;
        console.log(rsp.receipt.gasUsed);
        // assert.equal(rsp.receipt.gasUsed, 738140);

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });

      it('has gas cost of 738140 for 25 txns', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const outHash = '0x0100000000000000000000000000000000000000000000000000000000000001';
        const newPeriodHash = '0x0200000000000000000000000000000000000000000000000000000000000002';

        const txs = [];
        for (let i = 0; i < 25; i++) {
          txs.push(Tx.transfer(
            [new Input(new Outpoint(outHash, 0))],
            [new Output(50 + i, bob)]
          ).sign([alicePriv]));
        }

        const block = txs.reduce(
          (b, tx) => b.addTx(tx),
          new Block(33)
        );
        

        const rsp = await bridge.submitPeriodWithData(prevPeriodHash, newPeriodHash, block.hex()).should.be.fulfilled;
        console.log(rsp.receipt.gasUsed);
        // assert.equal(rsp.receipt.gasUsed, 738140);

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });

      it('has gas cost of 738140 for 50 txns', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const outHash = '0x0100000000000000000000000000000000000000000000000000000000000001';
        const newPeriodHash = '0x0200000000000000000000000000000000000000000000000000000000000002';

        const txs = [];
        for (let i = 0; i < 50; i++) {
          txs.push(Tx.transfer(
            [new Input(new Outpoint(outHash, 0))],
            [new Output(50 + i, bob)]
          ).sign([alicePriv]));
        }

        const block = txs.reduce(
          (b, tx) => b.addTx(tx),
          new Block(33)
        );
        

        const rsp = await bridge.submitPeriodWithData(prevPeriodHash, newPeriodHash, block.hex()).should.be.fulfilled;
        console.log(rsp.receipt.gasUsed);
        // assert.equal(rsp.receipt.gasUsed, 738140);

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });

      it('has gas cost of 738140 for 100 txns', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const outHash = '0x0100000000000000000000000000000000000000000000000000000000000001';
        const newPeriodHash = '0x0200000000000000000000000000000000000000000000000000000000000002';

        const txs = [];
        for (let i = 0; i < 100; i++) {
          txs.push(Tx.transfer(
            [new Input(new Outpoint(outHash, 0))],
            [new Output(50 + i, bob)]
          ).sign([alicePriv]));
        }

        const block = txs.reduce(
          (b, tx) => b.addTx(tx),
          new Block(33)
        );
        

        const rsp = await bridge.submitPeriodWithData(prevPeriodHash, newPeriodHash, block.hex()).should.be.fulfilled;
        console.log(rsp.receipt.gasUsed);
        // assert.equal(rsp.receipt.gasUsed, 738140);

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });

      it('has gas cost of 738140 for 200 txns', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const outHash = '0x0100000000000000000000000000000000000000000000000000000000000001';
        const newPeriodHash = '0x0200000000000000000000000000000000000000000000000000000000000002';

        const txs = [];
        for (let i = 0; i < 200; i++) {
          txs.push(Tx.transfer(
            [new Input(new Outpoint(outHash, 0))],
            [new Output(50 + i, bob)]
          ).sign([alicePriv]));
        }

        const block = txs.reduce(
          (b, tx) => b.addTx(tx),
          new Block(33)
        );
        

        const rsp = await bridge.submitPeriodWithData(prevPeriodHash, newPeriodHash, block.hex()).should.be.fulfilled;
        console.log(rsp.receipt.gasUsed);
        // assert.equal(rsp.receipt.gasUsed, 738140);

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });

      it('has gas cost of 738140 for 500 txns', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const outHash = '0x0100000000000000000000000000000000000000000000000000000000000001';
        const newPeriodHash = '0x0200000000000000000000000000000000000000000000000000000000000002';

        const txs = [];
        for (let i = 0; i < 500; i++) {
          txs.push(Tx.transfer(
            [new Input(new Outpoint(outHash, 0))],
            [new Output(50 + i, bob)]
          ).sign([alicePriv]));
        }

        const block = txs.reduce(
          (b, tx) => b.addTx(tx),
          new Block(33)
        );
        

        const rsp = await bridge.submitPeriodWithData(prevPeriodHash, newPeriodHash, block.hex()).should.be.fulfilled;
        console.log(rsp.receipt.gasUsed);
        // assert.equal(rsp.receipt.gasUsed, 738140);

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });

      it('has gas cost of 6602111 for 1000 txns', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const outHash = '0x0100000000000000000000000000000000000000000000000000000000000001';
        const newPeriodHash = '0x0200000000000000000000000000000000000000000000000000000000000002';

        const txs = [];
        for (let i = 0; i < 1000; i++) {
          txs.push(Tx.transfer(
            [new Input(new Outpoint(outHash, 0))],
            [new Output(50 + i, bob)]
          ).sign([alicePriv]));
        }

        const block = txs.reduce(
          (b, tx) => b.addTx(tx),
          new Block(33)
        );
        

        const rsp = await bridge.submitPeriodWithData(prevPeriodHash, newPeriodHash, block.hex()).should.be.fulfilled;
        assert.equal(rsp.receipt.gasUsed, 6602111);

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });

      it('has gas cost of 120430 for single tx with zk proof playload', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const outHash = '0x0100000000000000000000000000000000000000000000000000000000000001';
        const newPeriodHash = '0x0200000000000000000000000000000000000000000000000000000000000002';

        const spendTx = Tx.spendCond(
          [new Input({
            prevout: new Outpoint(outHash, 0),
            script: '0x12345629a9672b769695a4f7a1fd24b1c1cd84285f1ee2606cc12b8949a0f4d0afe80c18abb6e5ec1f1a4a399766304b53618f713528c06d7cbdd9',
          })], [new Output(50, bob)],
        );
        spendTx.inputs[0].setMsgData('0x29a9672b769695a4f7a1fd24b1c1cd84285f1ee2606cc12b8949a0f4d0afe80c18abb6e5ec1f1a4a399766304b53618f713528c06d7cbdd9d092f2710312f8e40e159ed025b0fd8dc4de95c8b1a9940f71aac314c53dc0519c9394d2d61af81f2ebf198ecb8d59286f9965b239aa8c61dd17e86a4c5dfccca11de8f345dbfb2d2cc22df8e7c266bec7ac0acd805ff64b3dc07d304d446b3529cd8f7dabb03e931d17f66edabf3358d714708a624b76e53fd9f162db015239d9cadb59d1620e2924a4c205e00ea9b94979f0e67ecca01cc1e7a2739bfa5fd460d399a0233f53ce2938485bf6ee4d1c78420b5a1b015106f516b5a5f12f69d68a68670fc0ed7722');
        console.log(spendTx.toRaw().length);

        const txs = [];
        txs.push(spendTx);

        const block = txs.reduce(
          (b, tx) => b.addTx(tx),
          new Block(33)
        );

        const rsp = await bridge.submitPeriodWithData(prevPeriodHash, newPeriodHash, block.hex()).should.be.fulfilled;
        console.log(rsp.receipt.gasUsed);
        // assert.equal(rsp.receipt.gasUsed, 738140);

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });

      it('has gas cost of 2467659 for 2 txns with zk proof playload', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const outHash = '0x0100000000000000000000000000000000000000000000000000000000000001';
        const newPeriodHash = '0x0200000000000000000000000000000000000000000000000000000000000002';

        const txs = [];
        for (let i = 0; i < 2; i++) {
          txs.push(Tx.spendCond(
            [new Input({
              prevout: new Outpoint(outHash, 0),
              script: '0x12345629a9672b769695a4f7a1fd24b1c1cd84285f1ee2606cc12b8949a0f4d0afe80c18abb6e5ec1f1a4a399766304b53618f713528c06d7cbdd929a9672b769695a4f7a1fd24b1c1cd84285f1ee2606cc12b8949a0f4d0afe80c18abb6e5ec1f1a4a399766304b53618f713528c06d7cbdd9d092f2710312f8e40e159ed025b0fd8dc4de95c8b1a9940f71aac314c53dc0519c9394d2d61af81f2ebf198ecb8d59286f9965b239aa8c61dd17e86a4c5dfccca11de8f345dbfb2d2cc22df8e7c266bec7ac0acd805ff64b3dc07d304d446b3529cd8f7dabb03e931d17f66edabf3358d714708a624b76e53fd9f162db015239d9cadb59d1620e2924a4c205e00ea9b94979f0e67ecca01cc1e7a2739bfa5fd460d399a0233f53ce2938485bf6ee4d1c78420b5a1b015106f516b5a5f12f69d68a68670fc0ed7722',
            })], [new Output(50 + i, bob)],
          ));
        }

        const block = txs.reduce(
          (b, tx) => b.addTx(tx),
          new Block(33)
        );
        

        const rsp = await bridge.submitPeriodWithData(prevPeriodHash, newPeriodHash, block.hex()).should.be.fulfilled;
        console.log(rsp.receipt.gasUsed);
        // assert.equal(rsp.receipt.gasUsed, 738140);

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });

      it('has gas cost of 2467659 for 5 txns with zk proof playload', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const outHash = '0x0100000000000000000000000000000000000000000000000000000000000001';
        const newPeriodHash = '0x0200000000000000000000000000000000000000000000000000000000000002';

        const txs = [];
        for (let i = 0; i < 5; i++) {
          txs.push(Tx.spendCond(
            [new Input({
              prevout: new Outpoint(outHash, 0),
              script: '0x12345629a9672b769695a4f7a1fd24b1c1cd84285f1ee2606cc12b8949a0f4d0afe80c18abb6e5ec1f1a4a399766304b53618f713528c06d7cbdd929a9672b769695a4f7a1fd24b1c1cd84285f1ee2606cc12b8949a0f4d0afe80c18abb6e5ec1f1a4a399766304b53618f713528c06d7cbdd9d092f2710312f8e40e159ed025b0fd8dc4de95c8b1a9940f71aac314c53dc0519c9394d2d61af81f2ebf198ecb8d59286f9965b239aa8c61dd17e86a4c5dfccca11de8f345dbfb2d2cc22df8e7c266bec7ac0acd805ff64b3dc07d304d446b3529cd8f7dabb03e931d17f66edabf3358d714708a624b76e53fd9f162db015239d9cadb59d1620e2924a4c205e00ea9b94979f0e67ecca01cc1e7a2739bfa5fd460d399a0233f53ce2938485bf6ee4d1c78420b5a1b015106f516b5a5f12f69d68a68670fc0ed7722',
            })], [new Output(50 + i, bob)],
          ));
        }

        const block = txs.reduce(
          (b, tx) => b.addTx(tx),
          new Block(33)
        );
        

        const rsp = await bridge.submitPeriodWithData(prevPeriodHash, newPeriodHash, block.hex()).should.be.fulfilled;
        console.log(rsp.receipt.gasUsed);
        // assert.equal(rsp.receipt.gasUsed, 738140);

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });

      it('has gas cost of 2467659 for 10 txns with zk proof playload', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const outHash = '0x0100000000000000000000000000000000000000000000000000000000000001';
        const newPeriodHash = '0x0200000000000000000000000000000000000000000000000000000000000002';

        const txs = [];
        for (let i = 0; i < 10; i++) {
          txs.push(Tx.spendCond(
            [new Input({
              prevout: new Outpoint(outHash, 0),
              script: '0x12345629a9672b769695a4f7a1fd24b1c1cd84285f1ee2606cc12b8949a0f4d0afe80c18abb6e5ec1f1a4a399766304b53618f713528c06d7cbdd929a9672b769695a4f7a1fd24b1c1cd84285f1ee2606cc12b8949a0f4d0afe80c18abb6e5ec1f1a4a399766304b53618f713528c06d7cbdd9d092f2710312f8e40e159ed025b0fd8dc4de95c8b1a9940f71aac314c53dc0519c9394d2d61af81f2ebf198ecb8d59286f9965b239aa8c61dd17e86a4c5dfccca11de8f345dbfb2d2cc22df8e7c266bec7ac0acd805ff64b3dc07d304d446b3529cd8f7dabb03e931d17f66edabf3358d714708a624b76e53fd9f162db015239d9cadb59d1620e2924a4c205e00ea9b94979f0e67ecca01cc1e7a2739bfa5fd460d399a0233f53ce2938485bf6ee4d1c78420b5a1b015106f516b5a5f12f69d68a68670fc0ed7722',
            })], [new Output(50 + i, bob)],
          ));
        }

        const block = txs.reduce(
          (b, tx) => b.addTx(tx),
          new Block(33)
        );
        

        const rsp = await bridge.submitPeriodWithData(prevPeriodHash, newPeriodHash, block.hex()).should.be.fulfilled;
        console.log(rsp.receipt.gasUsed);
        // assert.equal(rsp.receipt.gasUsed, 738140);

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });

      it('has gas cost of 2467659 for 25 txns with zk proof playload', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const outHash = '0x0100000000000000000000000000000000000000000000000000000000000001';
        const newPeriodHash = '0x0200000000000000000000000000000000000000000000000000000000000002';

        const txs = [];
        for (let i = 0; i < 25; i++) {
          txs.push(Tx.spendCond(
            [new Input({
              prevout: new Outpoint(outHash, 0),
              script: '0x12345629a9672b769695a4f7a1fd24b1c1cd84285f1ee2606cc12b8949a0f4d0afe80c18abb6e5ec1f1a4a399766304b53618f713528c06d7cbdd929a9672b769695a4f7a1fd24b1c1cd84285f1ee2606cc12b8949a0f4d0afe80c18abb6e5ec1f1a4a399766304b53618f713528c06d7cbdd9d092f2710312f8e40e159ed025b0fd8dc4de95c8b1a9940f71aac314c53dc0519c9394d2d61af81f2ebf198ecb8d59286f9965b239aa8c61dd17e86a4c5dfccca11de8f345dbfb2d2cc22df8e7c266bec7ac0acd805ff64b3dc07d304d446b3529cd8f7dabb03e931d17f66edabf3358d714708a624b76e53fd9f162db015239d9cadb59d1620e2924a4c205e00ea9b94979f0e67ecca01cc1e7a2739bfa5fd460d399a0233f53ce2938485bf6ee4d1c78420b5a1b015106f516b5a5f12f69d68a68670fc0ed7722',
            })], [new Output(50 + i, bob)],
          ));
        }

        const block = txs.reduce(
          (b, tx) => b.addTx(tx),
          new Block(33)
        );
        

        const rsp = await bridge.submitPeriodWithData(prevPeriodHash, newPeriodHash, block.hex()).should.be.fulfilled;
        console.log(rsp.receipt.gasUsed);
        // assert.equal(rsp.receipt.gasUsed, 738140);

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });

      it('has gas cost of 2467659 for 50 txns with zk proof playload', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const outHash = '0x0100000000000000000000000000000000000000000000000000000000000001';
        const newPeriodHash = '0x0200000000000000000000000000000000000000000000000000000000000002';

        const txs = [];
        for (let i = 0; i < 50; i++) {
          txs.push(Tx.spendCond(
            [new Input({
              prevout: new Outpoint(outHash, 0),
              script: '0x12345629a9672b769695a4f7a1fd24b1c1cd84285f1ee2606cc12b8949a0f4d0afe80c18abb6e5ec1f1a4a399766304b53618f713528c06d7cbdd929a9672b769695a4f7a1fd24b1c1cd84285f1ee2606cc12b8949a0f4d0afe80c18abb6e5ec1f1a4a399766304b53618f713528c06d7cbdd9d092f2710312f8e40e159ed025b0fd8dc4de95c8b1a9940f71aac314c53dc0519c9394d2d61af81f2ebf198ecb8d59286f9965b239aa8c61dd17e86a4c5dfccca11de8f345dbfb2d2cc22df8e7c266bec7ac0acd805ff64b3dc07d304d446b3529cd8f7dabb03e931d17f66edabf3358d714708a624b76e53fd9f162db015239d9cadb59d1620e2924a4c205e00ea9b94979f0e67ecca01cc1e7a2739bfa5fd460d399a0233f53ce2938485bf6ee4d1c78420b5a1b015106f516b5a5f12f69d68a68670fc0ed7722',
            })], [new Output(50 + i, bob)],
          ));
        }

        const block = txs.reduce(
          (b, tx) => b.addTx(tx),
          new Block(33)
        );
        

        const rsp = await bridge.submitPeriodWithData(prevPeriodHash, newPeriodHash, block.hex()).should.be.fulfilled;
                console.log(rsp.receipt.gasUsed);
        // assert.equal(rsp.receipt.gasUsed, 738140);

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });
      it('has gas cost of 2467659 for 100 txns with zk proof playload', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const outHash = '0x0100000000000000000000000000000000000000000000000000000000000001';
        const newPeriodHash = '0x0200000000000000000000000000000000000000000000000000000000000002';

        const txs = [];
        for (let i = 0; i < 100; i++) {
          txs.push(Tx.spendCond(
            [new Input({
              prevout: new Outpoint(outHash, 0),
              script: '0x12345629a9672b769695a4f7a1fd24b1c1cd84285f1ee2606cc12b8949a0f4d0afe80c18abb6e5ec1f1a4a399766304b53618f713528c06d7cbdd929a9672b769695a4f7a1fd24b1c1cd84285f1ee2606cc12b8949a0f4d0afe80c18abb6e5ec1f1a4a399766304b53618f713528c06d7cbdd9d092f2710312f8e40e159ed025b0fd8dc4de95c8b1a9940f71aac314c53dc0519c9394d2d61af81f2ebf198ecb8d59286f9965b239aa8c61dd17e86a4c5dfccca11de8f345dbfb2d2cc22df8e7c266bec7ac0acd805ff64b3dc07d304d446b3529cd8f7dabb03e931d17f66edabf3358d714708a624b76e53fd9f162db015239d9cadb59d1620e2924a4c205e00ea9b94979f0e67ecca01cc1e7a2739bfa5fd460d399a0233f53ce2938485bf6ee4d1c78420b5a1b015106f516b5a5f12f69d68a68670fc0ed7722',
            })], [new Output(50 + i, bob)],
          ));
        }

        const block = txs.reduce(
          (b, tx) => b.addTx(tx),
          new Block(33)
        );
        

        const rsp = await bridge.submitPeriodWithData(prevPeriodHash, newPeriodHash, block.hex()).should.be.fulfilled;
        assert.equal(rsp.receipt.gasUsed, 2467659);

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });

      it('has gas cost of 2467659 for 200 txns with zk proof playload', async() => {
        const prevPeriodHash = await bridge.tipHash();
        const outHash = '0x0100000000000000000000000000000000000000000000000000000000000001';
        const newPeriodHash = '0x0200000000000000000000000000000000000000000000000000000000000002';

        const txs = [];
        for (let i = 0; i < 200; i++) {
          txs.push(Tx.spendCond(
            [new Input({
              prevout: new Outpoint(outHash, 0),
              script: '0x12345629a9672b769695a4f7a1fd24b1c1cd84285f1ee2606cc12b8949a0f4d0afe80c18abb6e5ec1f1a4a399766304b53618f713528c06d7cbdd929a9672b769695a4f7a1fd24b1c1cd84285f1ee2606cc12b8949a0f4d0afe80c18abb6e5ec1f1a4a399766304b53618f713528c06d7cbdd9d092f2710312f8e40e159ed025b0fd8dc4de95c8b1a9940f71aac314c53dc0519c9394d2d61af81f2ebf198ecb8d59286f9965b239aa8c61dd17e86a4c5dfccca11de8f345dbfb2d2cc22df8e7c266bec7ac0acd805ff64b3dc07d304d446b3529cd8f7dabb03e931d17f66edabf3358d714708a624b76e53fd9f162db015239d9cadb59d1620e2924a4c205e00ea9b94979f0e67ecca01cc1e7a2739bfa5fd460d399a0233f53ce2938485bf6ee4d1c78420b5a1b015106f516b5a5f12f69d68a68670fc0ed7722',
            })], [new Output(50 + i, bob)],
          ));
        }

        const block = txs.reduce(
          (b, tx) => b.addTx(tx),
          new Block(33)
        );
        

        const rsp = await bridge.submitPeriodWithData(prevPeriodHash, newPeriodHash, block.hex()).should.be.fulfilled;
        console.log(rsp.receipt.gasUsed);
        // assert.equal(rsp.receipt.gasUsed, 738140);

        const newTip = await bridge.tipHash();
        newTip.should.be.equal(newPeriodHash);
      });

    });

  });
});