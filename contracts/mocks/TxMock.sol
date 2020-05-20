
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity ^0.5.12;
pragma experimental ABIEncoderV2; // solium-disable-line no-experimental
import "../TxLib.sol";

/**
 * @title TxMock
 * @dev used to test Transaction lib
 */

contract TxMock {
  using TxLib for TxLib.Tx;
  using TxLib for TxLib.TxType;

  function parse(bytes32[] memory _proof) public pure returns (TxLib.Tx memory txn) {
    bytes memory txData;
    (, , txData) = TxLib.validateProof(0, _proof);
    txn = TxLib.parseTx(txData);
  }

  function validateProof(bytes32[] memory _proof)
    public pure returns (uint64 txPos, bytes32 txHash, bytes memory txData) {
    (txPos, txHash, txData) = TxLib.validateProof(0, _proof);
  }

  function getSigHash(bytes memory _txData) public pure returns (bytes32) {
    return TxLib.getSigHash(_txData);
  }

  function getUtxoId(uint256 _outputIndex, bytes32 _txHash) public pure returns (bytes32) {
    return bytes32(uint256(_outputIndex) << 120 | uint120(uint256(_txHash)));
  }
}