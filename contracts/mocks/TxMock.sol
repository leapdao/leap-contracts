
/**
 * Copyright (c) 2017-present, Parsec Labs (parseclabs.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity ^0.4.24;

import "../TxLib.sol";


/**
 * @title TxMock
 * @dev used to test Transaction lib
 */
contract TxMock {
  using TxLib for TxLib.Tx;
  using TxLib for TxLib.TxType;

  function parse(bytes32[] _proof) public pure returns (uint256 txType, bytes32[] rsp, bytes msgData) {
    bytes memory txData;
    (, , txData) = TxLib.validateProof(0, _proof);

    TxLib.Tx memory txn = TxLib.parseTx(txData);

    txType = typeToInt(txn.txType);
    rsp = new bytes32[](2 + txn.ins.length * 5 + txn.outs.length * 5);
    rsp[0] = bytes32(txn.ins.length);
    rsp[1] = bytes32(txn.outs.length);
    // inputs
    for (uint i = 0; i < txn.ins.length; i++) {
      flattenInput(txn.ins[i], 2 + i * 5, rsp);
    }
    // output
    for (i = 0; i < txn.outs.length; i++) {
      flattenOutput(txn.outs[i], 2 + txn.ins.length * 5 + i * 5, rsp);
    }
    if (txn.txType == TxLib.TxType.CompReq) {
      msgData = txn.outs[0].msgData;
    }
  }

  function flattenInput(TxLib.Input _input, uint256 _offset, bytes32[] _rsp) internal pure {
    _rsp[_offset] = bytes32(_input.outpoint.hash);
    _rsp[_offset + 1] = bytes32(_input.outpoint.pos);
    _rsp[_offset + 2] = bytes32(_input.r);
    _rsp[_offset + 3] = bytes32(_input.s);
    _rsp[_offset + 4] = bytes32(_input.v);
  }

  function flattenOutput(TxLib.Output _output, uint256 _offset, bytes32[] _rsp) internal pure {
    _rsp[_offset] = bytes32(_output.value);
    _rsp[_offset + 1] = bytes32(_output.color);
    _rsp[_offset + 2] = bytes32(_output.owner);
    _rsp[_offset + 3] = bytes32(_output.gasPrice);
    _rsp[_offset + 4] = bytes32(_output.stateRoot);
  }

  function typeToInt(TxLib.TxType _type) internal pure returns (uint256) {
    if (_type == TxLib.TxType.Deposit) {
      return 2;
    } else if (_type == TxLib.TxType.Transfer) {
      return 3;
    } else if (_type == TxLib.TxType.Consolidate) {
      return 4;
    } else if (_type == TxLib.TxType.CompReq) {
      return 5;
    } else if (_type == TxLib.TxType.CompRsp) {
      return 6;
    }
  }

  function validateProof(bytes32[] _proof) public pure returns (uint64 txPos, bytes32 txHash, bytes memory txData) {
    (txPos, txHash, txData) = TxLib.validateProof(0, _proof);
  }

  function getSigHash(bytes _txData) public pure returns (bytes32) {
    return TxLib.getSigHash(_txData);
  }
}