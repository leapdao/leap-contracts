/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

const utils = require('web3-utils');

const JSBI = require('jsbi');


const one = JSBI.BigInt(1);
const two = JSBI.BigInt(2);


function setTrailBit(trail, pos) {
  const bytePos = (trail.length - 1) - Math.floor(pos / 8);
  let val = trail.readUInt8(bytePos);
  val += 1 << (pos % 8); // eslint-disable-line no-bitwise
  trail.writeUInt8(val, bytePos);
}

module.exports = class SmtLib {
  constructor(depth, leaves) {
    this.depth = depth;
    // Initialize defaults
    this.defaultNodes = this.setdefaultNodes(depth);
    // Leaves must be a dictionary with key as the leaf's slot and value the leaf's hash
    this.leaves = leaves;

    if (leaves && Object.keys(leaves).length !== 0) {
      this.tree = this.createTree(this.leaves, this.depth, this.defaultNodes);
      this.root = this.tree[this.depth]['0'];
    } else {
      this.tree = [];
      this.root = this.defaultNodes[this.depth];
    }
  }

  setdefaultNodes(depth) {
    let defaultNodes = new Array(depth + 1);
    defaultNodes[0] = utils.soliditySha3(0);
    for (let i = 1; i < depth + 1; i++) {
      defaultNodes[i] = utils.soliditySha3(defaultNodes[i-1], defaultNodes[i-1]);
    }
    return defaultNodes;
  }

  createTree(orderedLeaves, depth, defaultNodes) {
    let tree = [orderedLeaves];
    let treeLevel = orderedLeaves;

    let nextLevel = {};
    let halfIndex;
    let value;

    for (let level = 0; level < depth; level++) {
      nextLevel = {};
      for(let index in treeLevel) {
        halfIndex = JSBI.divide(JSBI.BigInt(index, 10), two).toString();
        value = treeLevel[index];
        if (JSBI.__absoluteModSmall(JSBI.BigInt(index, 10), two) === 0) {
          let coIndex = JSBI.add(JSBI.BigInt(index, 10), one).toString();
          nextLevel[halfIndex] = utils.soliditySha3(value, treeLevel[coIndex] || defaultNodes[level]);
        } else {
          let coIndex = JSBI.subtract(JSBI.BigInt(index, 10), one).toString();
          if (treeLevel[coIndex] === undefined) {
            nextLevel[halfIndex] = utils.soliditySha3(defaultNodes[level], value);
          }
        }
      }
      treeLevel = nextLevel;
      tree.push(treeLevel);
    }
    return tree;
  }

  createMerkleProof(uid) {
    let index = JSBI.BigInt(uid, 10);
    let proof = '';
    let trail = Buffer.alloc(this.depth / 8, 0);
    let siblingIndex;
    let siblingHash;
    for (let level = 0; level < this.depth; level++) {
      siblingIndex = (JSBI.__absoluteModSmall(index, 2) === 0) ? JSBI.add(index, one) : JSBI.subtract(index, one);
      index = JSBI.divide(index, two);
      if (level < this.tree.length) {
        siblingHash = this.tree[level][siblingIndex.toString(10)];
        if (siblingHash) {
          proof += siblingHash.replace('0x', '');
          setTrailBit(trail, level);
        }
      }
    }
    let total = Buffer.concat([trail, Buffer.from(proof, 'hex')]);
    return '0x' + total.toString('hex');
  }
}
