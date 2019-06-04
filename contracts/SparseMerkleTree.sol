/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity >=0.4.21 <0.6.0;


// Based on https://rinkeby.etherscan.io/address/0x881544e0b2e02a79ad10b01eca51660889d5452b#code
contract SparseMerkleTree {

  uint8 constant DEPTH = 160;
  bytes20[DEPTH + 1] public defaultHashes; //or address array - address[]
  bytes20 public root; //or address

  constructor() public {
    // defaultHash[0] is being set to keccak256(uint256(0))[12:];
    defaultHashes[0] = 0x88386fc84ba6bc95484008f6362f93160ef3e563;
    for (uint8 i = 1; i <= DEPTH; i ++) {
      defaultHashes[i] = bytes20(keccak256(abi.encodePacked(defaultHashes[i-1], defaultHashes[i-1])));
    }
    root = defaultHashes[DEPTH];
  }

  function read(address key, bytes20 leaf, bytes memory proof) public view returns (bool) {
    bytes20 calculatedRoot = getRoot(leaf, key, proof);
    return (calculatedRoot == root);
  }

  function write(address key, bytes20 prevLeaf, bytes memory proof, bytes20 newLeaf) public {
    bytes20 calculatedRoot = getRoot(prevLeaf, key, proof);
    require(calculatedRoot == root, "update proof not valid");
    root = getRoot(newLeaf, key, proof);
  }

  function del(address key, bytes20 prevLeaf, bytes memory proof) public {
    bytes20 calculatedRoot = getRoot(prevLeaf, key, proof);
    require(calculatedRoot == root, "update proof not valid");
    root = getRoot(defaultHashes[0], key, proof);
  }

  // first 160 bits of the proof are the 0/1 bits
  function getRoot(bytes20 leaf, uint160 _index, bytes memory proof) public view returns (bytes20) {
    require((proof.length - 8) % 20 == 0 && proof.length <= 3208, "invalid proof format");
    bytes20 proofElement;
    bytes20 computedHash = leaf;
    uint16 p = 8;
    uint160 proofBits;
    uint160 index = _index;
    assembly {proofBits := div(mload(add(proof, 20)), exp(160, 24))}

    for (uint d = 0; d < DEPTH; d++ ) {
      if (proofBits % 2 == 0) { // check if last bit of proofBits is 0
        proofElement = defaultHashes[d];
      } else {
        p += 20;
        require(proof.length >= p, "proof not long enough");
        assembly { proofElement := mload(add(proof, p)) }
      }
      if (index % 2 == 0) {
        computedHash = bytes20(keccak256(abi.encodePacked(computedHash, proofElement)));
      } else {
        computedHash = bytes20(keccak256(abi.encodePacked(proofElement, computedHash)));
      }
      proofBits = proofBits / 2; // shift it right for next bit
      index = index / 2;
    }
    return computedHash;
  }
}
