
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.4.24;

import "./ExitHandler.sol";
import "./Bridge.sol";
import "./TxLib.sol";

contract FastExitHandler is ExitHandler {

  function startBoughtExit(bytes32[] _proof, uint256 _oindex, bytes32[] signedData) public payable {

    (bytes32 parent,,,uint32 timestamp) = bridge.periods(_proof[0]);
    // validate proof
    bytes32 txHash;
    bytes memory txData;
    uint64 txPos;
    (txPos, txHash, txData) = TxLib.validateProof(64, _proof);
    // parse tx and use data
    TxLib.Tx memory txn = TxLib.parseTx(txData);
    TxLib.Output memory out = txn.outs[_oindex];
    (uint256 buyPrice, bytes32 utxoIdSigned, address signer) = unpackSignedData(signedData);

    require(parent > 0, "Proof root was not submitted as period");
    require(msg.value >= exitStake, "Not enough ether sent to pay for exit stake");
    require(!isNft(out.color), "Can not fast exit NFTs");
    require(out.owner == address(this), "Funds were not sent to this contract");
    require(
      ecrecover(
        TxLib.getSigHash(txData), 
        txn.ins[0].v, txn.ins[0].r, txn.ins[0].s
      ) == signer,
      "Signer was not the previous owenr of UTXO"
    );
    require(
      bytes32((_oindex << 120) | uint120(txHash)) == utxoIdSigned, 
      "The signed utxoid does not match the one in the proof"
    );
    require(out.value > 0, "Exit has no value");
    require(exits[utxoIdSigned].amount == 0, "The exit for UTXO has already been started");
    require(!exits[utxoIdSigned].finalized, "The exit for UTXO has already been finalized");

    uint256 priority = getERC20ExitPriority(timestamp, utxoIdSigned, txPos);
    
    // pay the seller
    tokens[out.color].addr.transferFrom(msg.sender, signer, buyPrice);

    tokens[out.color].insert(priority);

    // give exit to buyer
    exits[utxoIdSigned] = Exit({
      owner: msg.sender,
      color: out.color,
      amount: out.value,
      finalized: false,
      stake: exitStake,
      priorityTimestamp: timestamp
    });
    emit ExitStarted(
      txHash, 
      _oindex, 
      out.color, 
      out.owner, 
      out.value
    );
  }

  function unpackSignedData(
    bytes32[] signedData
  ) internal pure returns (
    uint256 buyPrice, bytes32 utxoId, address signer
  ) {
    bytes32[] memory sigBuff = new bytes32[](2);
    utxoId = signedData[0];
    buyPrice = uint256(signedData[1]);
    bytes32 r = signedData[2];
    bytes32 s = signedData[3];
    uint8 v = uint8(signedData[4]);
    sigBuff[0] = utxoId;
    sigBuff[1] = signedData[1];
    bytes32 sigHash = keccak256(sigBuff);
    signer = ecrecover(sigHash, v, r, s); // solium-disable-line arg-overflow
  }
}