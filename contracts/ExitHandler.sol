
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.4.24;

import "openzeppelin-eth/contracts/math/Math.sol";

import "./DepositHandler.sol";
import "./Bridge.sol";
import "./TxLib.sol";
import "./PriorityQueue.sol";

contract ExitHandler is DepositHandler {

  using PriorityQueue for PriorityQueue.Token;

  event ExitStarted(
    bytes32 indexed txHash, 
    uint256 indexed outIndex, 
    uint256 indexed color, 
    address exitor, 
    uint256 amount
  );

  struct Exit {
    uint256 amount;
    uint16 color;
    address owner;
    bool finalized;
    uint256 stake;
  }

  uint256 public exitDuration;
  uint256 public exitStake;
  uint256 public nftExitCounter;

  /**
   * UTXO → Exit mapping. Contains exits for both NFT and ERC20 colors
   */
  mapping(bytes32 => Exit) public exits;

  function initializeWithExit(
    Bridge _bridge, 
    uint256 _exitDuration, 
    uint256 _exitStake) public initializer {
    initialize(_bridge);
    exitDuration = _exitDuration;
    exitStake = _exitStake;
  }

  function setExitStake(uint256 _exitStake) public ifAdmin {
    exitStake = _exitStake;
  }

  function startExit(bytes32[] _proof, uint256 _outputIndex) public payable {
    require(msg.value >= exitStake, "Not enough ether sent to pay for exit stake");

    (bytes32 parent,,,uint32 timestamp) = bridge.periods(_proof[0]);
    require(parent > 0, "The referenced period was not submitted to bridge");

    // validate proof
    bytes32 txHash;
    bytes memory txData;
    (, txHash, txData) = TxLib.validateProof(32, _proof);
    // parse tx and use data
    TxLib.Output memory out = TxLib.parseTx(txData).outs[_outputIndex];

    require(out.owner == msg.sender, "Only UTXO owner can start exit");
    // TODO: Safe math needed? Our period timestamp is only uint32, maybe exploitable?
    uint256 exitableAt = Math.max(timestamp + (2 * exitDuration), block.timestamp + exitDuration);
    bytes32 utxoId = bytes32((_outputIndex << 120) | uint120(txHash));

    require(out.value > 0, "UTXO has no value");
    require(exits[utxoId].amount == 0, "The exit for UTXO has already been started");
    require(!exits[utxoId].finalized, "The exit for UTXO has already been finalized");

    uint256 priority;
    if (isNft(out.color)) {
      priority = (nftExitCounter << 128) | uint128(utxoId);
      nftExitCounter++;
    } else {
      priority = (exitableAt << 128) | uint128(utxoId);
    }

    tokens[out.color].insert(priority);

    exits[utxoId] = Exit({
      owner: out.owner,
      color: out.color,
      amount: out.value,
      finalized: false,
      stake: exitStake
    });
    emit ExitStarted(
      txHash, 
      _outputIndex, 
      out.color, 
      out.owner, 
      out.value
    );
  }

  // @dev Finalizes exit for the chosen color with the highest priority
  function finalizeTopExit(uint16 _color) public {
    bytes32 utxoId;
    uint256 exitableAt;
    (utxoId, exitableAt) = getNextExit(_color);

    require(exitableAt <= block.timestamp, "The top exit can not be exited yet");
    require(tokens[_color].currentSize > 0, "The exit queue for color is empty");

    Exit memory currentExit = exits[utxoId];

    if (currentExit.owner != 0 || currentExit.amount != 0) { // exit was removed
      // Note: for NFTs, the amount is actually the NFT id (both uint256)
      if (isNft(currentExit.color)) {
        tokens[currentExit.color].addr.transferFrom(address(this), currentExit.owner, currentExit.amount);
      } else {
        tokens[currentExit.color].addr.approve(address(this), currentExit.amount);
        tokens[currentExit.color].addr.transferFrom(address(this), currentExit.owner, currentExit.amount);
      }
      // Pay exit stake
      currentExit.owner.transfer(currentExit.stake);
    }

    tokens[currentExit.color].delMin();
    exits[utxoId].finalized = true;
  }

  function getNextExit(uint16 _color) internal view returns (bytes32 utxoId, uint256 exitableAt) {
    uint256 priority = tokens[_color].getMin();
    utxoId = bytes32(uint128(priority));
    exitableAt = priority >> 128;
  }

  function isNft(uint16 _color) internal pure returns (bool) {
    return _color > 32768; // 2^15
  }

  function challengeExit(
    bytes32[] _proof, 
    bytes32[] _prevProof, 
    uint256 _outputIndex, 
    uint256 _inputIndex
  ) public {
    // validate exiting tx
    uint256 offset = 32 * (_proof.length + 2);
    bytes32 txHash1;
    (, txHash1, ) = TxLib.validateProof(offset + 64, _prevProof);
    bytes32 utxoId = bytes32((_outputIndex << 120) | uint120(txHash1));

    require(exits[utxoId].amount > 0);

    // validate spending tx
    bytes memory txData;
    (, , txData) = TxLib.validateProof(96, _proof);
    TxLib.Tx memory txn = TxLib.parseTx(txData);

    // make sure one is spending the other one
    require(txHash1 == txn.ins[_inputIndex].outpoint.hash);
    require(_outputIndex == txn.ins[_inputIndex].outpoint.pos);

    // if transfer, make sure signature correct
    if (txn.txType == TxLib.TxType.Transfer) {
      bytes32 sigHash = TxLib.getSigHash(txData);
      address signer = ecrecover(
        sigHash, 
        txn.ins[_inputIndex].v, 
        txn.ins[_inputIndex].r, 
        txn.ins[_inputIndex].s
      );
      require(exits[utxoId].owner == signer);
    }

    // award stake to challanger
    msg.sender.transfer(exits[utxoId].stake);
    // delete invalid exit
    delete exits[utxoId];
  }

  // Use this to find calldata offset - you are looking for the number:
  // (offest of _proof in calldata (in bytes)) - 68
  // ಠ_ಠ
  event Debug(bytes data);
  function emitCallData() internal {
    uint256 size;
    assembly {
      size := calldatasize()
    }
    bytes memory callData = new bytes(size);
    assembly {
      calldatacopy(add(callData, 32), 0, size)
    }
    emit Debug(callData);
  }

  uint256[50] private ______gap;
}