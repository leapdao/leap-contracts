/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

import "../node_modules/solEVM-enforcer/contracts/Enforcer.sol";
import "./TxLib.sol";
import "./Bridge.sol";

contract PlasmaEnforcer is Enforcer {

  Bridge public bridge;

  constructor(
    address _verifier,
    uint256 _challengePeriod,
    uint256 _bondAmount,
    uint256 _maxExecutionDepth,
    address _bridge) public Enforcer(_verifier, _challengePeriod, _bondAmount, _maxExecutionDepth) {
    bridge = Bridge(_bridge);
  }

  /**
   * txHash -> Verification Start Time mapping.
   * Used to verify consolidate and computation transactions
   * before they can be used to challenge exits.
   */

  mapping(bytes32 => TxLib.Output) verifications;

  function verificationStartTime(bytes32 txHash) public view returns (uint256) {
    return verifications[txHash].startTime;
  }

  /**
   * Spending conditions require an interactive game to ensure validity of transaction.
   * A verification process is introduced with half the duration of the exit procedure.
   * During this verification a transaction can be challenged before it is whitelisted
   * to be used in an exit challenge. We use this verification process to scrutinize 
   * the validity of spending conditions.
   */
  function startWhitelisting(bytes32[] memory _proof, uint8 _outputIndex, bytes32 _rootHash) public payable {
    require(msg.value >= bondAmount, "Not enough ether sent to pay for verification stake");
    uint32 timestamp;
    (,timestamp) = bridge.periods(_proof[0]);
    require(timestamp > 0, "The referenced period was not submitted to bridge");

    // check exiting tx inclusion in the root chain block
    bytes32 utxoId;
    bytes memory txData;
    (, utxoId, txData) = TxLib.validateProof(64, _proof);
    if (uint256(_rootHash) == 0) {
      utxoId = bytes32(uint256(_outputIndex) << 248 | uint248(uint256(utxoId)));
    }
    require(verifications[utxoId].stake == 0, "Transaction already registered");
    TxLib.Tx memory txn = TxLib.parseTx(txData);

    if (uint256(_rootHash) > 0) {
       // iterate over all inputs
      // make sure these inputs have been registered for verification
      // fail if not
      // if yes, then delete them all and return stakes
      uint256 stake = 0;
      for (uint i = 0; i < txn.ins.length; i++) {
        bytes32 prevUtxoId = txn.ins[i].outpoint.hash;
        prevUtxoId = bytes32((uint256(txn.ins[i].outpoint.pos) << 248) | uint248(uint256(txn.ins[i].outpoint.hash)));
        WhitelistVerification memory prevVerification = verifications[prevUtxoId];
        require(prevVerification.startTime > 0, "Input not found");
        stake += prevVerification.stake;

        // create array for hashing
        delete verifications[prevUtxoId];
      }
      msg.sender.transfer(stake);
      // call register function
    }
    verifications[utxoId] = WhitelistVerification(uint32(block.timestamp), txn.outs[_outputIndex], msg.value);
    emit WhitelistStarted(utxoId);
  }

}
