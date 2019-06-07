/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

import { keccak256 } from 'ethereumjs-util';

const JSBI = require('jsbi');


const one = JSBI.BigInt(1);
const two = JSBI.BigInt(2);
const merkelize = (hash1, hash2) => {
  const buffer = Buffer.alloc(64, 0);
  if (typeof hash1 === 'string' || hash1 instanceof String) {
    buffer.write(hash1.replace('0x', ''), 'hex');
  } else {
    hash1.copy(buffer);
  }
  if (typeof hash2 === 'string' || hash2 instanceof String) {
    buffer.write(hash2.replace('0x', ''), 32, 'hex');
  } else {
    hash2.copy(buffer, 32);
  }
  return `0x${keccak256(buffer).toString('hex')}`;
};

function setTrailBit(trail, pos) {
  const bytePos = (trail.length - 1) - Math.floor(pos / 8);
  let val = trail.readUInt8(bytePos);
  val += 1 << (pos % 8); // eslint-disable-line no-bitwise
  trail.writeUInt8(val, bytePos);
}

function setdefaultNodes(depth) {
  const defaultNodes = new Array(depth + 1);
  defaultNodes[0] = keccak256(Buffer.alloc(32, 0));
  for (let i = 1; i < depth + 1; i++) {
    defaultNodes[i] = merkelize(defaultNodes[i-1], defaultNodes[i-1]);
  }
  return defaultNodes;
}

function createTree(orderedLeaves, depth, defaultNodes) {
  const tree = [orderedLeaves];
  let treeLevel = orderedLeaves;

  let nextLevel = {};
  let halfIndex;
  let value;

  for (let level = 0; level < depth; level++) {
    nextLevel = {};
    for (const index in treeLevel) { // eslint-disable-line no-restricted-syntax
      if (treeLevel.hasOwnProperty(index)) { // eslint-disable-line no-prototype-builtins
        halfIndex = JSBI.divide(JSBI.BigInt(index, 10), two).toString();
        value = treeLevel[index];
        if (JSBI.__absoluteModSmall(JSBI.BigInt(index, 10), two) === 0) { // eslint-disable-line no-underscore-dangle
          const coIndex = JSBI.add(JSBI.BigInt(index, 10), one).toString();
          nextLevel[halfIndex] = merkelize(value, treeLevel[coIndex] || defaultNodes[level]);
        } else {
          const coIndex = JSBI.subtract(JSBI.BigInt(index, 10), one).toString();
          if (treeLevel[coIndex] === undefined) {
            nextLevel[halfIndex] = merkelize(defaultNodes[level], value);
          }
        }
      }
    }
    treeLevel = nextLevel;
    tree.push(treeLevel);
  }
  return tree;
}

module.exports = class SmtLib {
  constructor(depth, leaves) {
    this.depth = depth;
    // Initialize defaults
    this.defaultNodes = setdefaultNodes(depth);
    // Leaves must be a dictionary with key as the leaf's slot and value the leaf's hash
    this.leaves = leaves;

    if (leaves && Object.keys(leaves).length !== 0) {
      this.tree = createTree(this.leaves, this.depth, this.defaultNodes);
      this.root = this.tree[this.depth]['0'];
    } else {
      this.tree = [];
      this.root = this.defaultNodes[this.depth];
    }
  }

  createMerkleProof(uid) {
    let index = JSBI.BigInt(uid, 10);
    let proof = '';
    const trail = Buffer.alloc(this.depth / 8, 0);
    let siblingIndex;
    let siblingHash;
    for (let level = 0; level < this.depth; level++) {
      siblingIndex = (JSBI.__absoluteModSmall(index, 2) === 0) ? JSBI.add(index, one) : JSBI.subtract(index, one); // eslint-disable-line no-underscore-dangle
      index = JSBI.divide(index, two);
      if (level < this.tree.length) {
        siblingHash = this.tree[level][siblingIndex.toString(10)];
        if (siblingHash) {
          proof += siblingHash.replace('0x', '');
          setTrailBit(trail, level);
        }
      }
    }
    const total = Buffer.concat([trail, Buffer.from(proof, 'hex')]);
    return `0x${  total.toString('hex')}`;
  }
}
