
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

/* solium-disable security/no-block-members */

pragma solidity 0.5.2;

import "../node_modules/openzeppelin-solidity/contracts/math/Math.sol";

import "./DepositHandler.sol";
import "./Bridge.sol";
import "./TxLib.sol";
import "./PriorityQueue.sol";

contract ExitHandler is DepositHandler {

  using PriorityQueue for PriorityQueue.Token;

  event ExitStarted(
    bytes32 indexed txHash, 
    uint8 indexed outIndex, 
    uint256 indexed color, 
    address exitor, 
    uint256 amount
  );

  struct Exit {
    uint256 amount;
    uint16 color;
    address owner;
    bool finalized;
    uint32 priorityTimestamp;
    uint256 stake;
  }

  uint256 public exitDuration;
  uint256 public exitStake;
  uint256 public nftExitCounter;

  /**
   * UTXO → Exit mapping. Contains exits for both NFT and ERC20 colors
   */
  mapping(bytes32 => Exit) public exits;

  struct Verification {
    uint32 startTime;
    address owner;
    uint256 stake;
  }

  event VerificationStarted(bytes32 indexed txHash);
  /**
   * txHash -> Verification Start Time mapping.
   * Used to verify consolidate and computation transactions
   * before they can be used to challenge exits.
   */
  mapping(bytes32 => Verification) public verifications;

  /**
   * Consolidate tx inputs are unsigned, hence an operator
   * could create and include invalid consolidate txns to:
   * a) challenge valid exits.
   * b) decrease the priority of funds in exit queue by consolidating them,
   *    putting the priority lower than his own transaction in the latest block.
   *
   * The following invalid txns are possible:
   * - consolidates with out-of-no-where inputs. (a,b)
   * - consolidates with inputs from utxos of other owners. (a,b)
   * - consolidates with inputs from spent utxos of same owner. (a)
   * - consolidates with duplicate inputs. (a)
   *
   * A verification process is introduced with half the duration of the exit procedure.
   * During this verification a transaction can be challenged before it is whitelisted
   * to be used in an exit challenge. We use this verification process to scrutinize 
   * the validity of complex transactions (consolidate and spending conditions).
   */
  function startVerification(bytes32[] memory _proof, uint8 _outputIndex) public payable {
    require(msg.value >= exitStake, "Not enough ether sent to pay for verification stake");
    bytes32 parent;
    (parent,,,) = bridge.periods(_proof[0]);
    require(parent > 0, "The referenced period was not submitted to bridge");

    // check exiting tx inclusion in the root chain block
    bytes32 utxoId;
    bytes memory txData;
    (, utxoId, txData) = TxLib.validateProof(32, _proof);
    if (_outputIndex > 0) {
      utxoId = bytes32(uint256(_outputIndex) << 248 | uint248(uint256(utxoId)));
    }
    require(verifications[utxoId].stake == 0, "Transaction already registered");

    TxLib.Tx memory txn = TxLib.parseTx(txData);
    require(_outputIndex < txn.outs.length, "Output index out of range");
    address owner = txn.outs[_outputIndex].owner;

    if (txn.txType == TxLib.TxType.Consolidate) {
       // iterate over all inputs
      // make sure these inputs have been registered for verification
      // fail if not
      // if yes, then delete them all and return stakes
      uint256 stake = 0;
      for (uint i = 0; i < txn.ins.length; i++) {
        bytes32 prevUtxoId = txn.ins[i].outpoint.hash;
        if (txn.ins[i].outpoint.pos > 0) {
          prevUtxoId = bytes32((uint256(txn.ins[i].outpoint.pos) << 248) | uint248(uint256(txn.ins[i].outpoint.hash)));
        }
        Verification memory prevVerification = verifications[prevUtxoId];
        require(prevVerification.startTime > 0, "Input not found");
        require(prevVerification.owner == owner, "Input belongs to different owner");
        stake += prevVerification.stake;
        delete verifications[prevUtxoId];
      }
      msg.sender.transfer(stake);
    }

    verifications[utxoId] = Verification(uint32(block.timestamp), txn.outs[_outputIndex].owner, msg.value);
    emit VerificationStarted(utxoId);
  }

  /**
   * An input to the consolidate tx has been spent by some other tx.
   * Because consolidate inputs are not signed, the other transaction takes precedence,
   * and the consolidate transaction should not be usable in a challenge.
   */
  function challengeConsolidateDoublespent(
    bytes32[] memory _doublespendProof, bytes32[] memory _consolidateProof,
    uint8 _inputIndex, uint8 _consolidateInputIndex) public {
    // output owner of consolidate proof different then owner of some input
    bytes32 parent;
    (parent,,,) = bridge.periods(_doublespendProof[0]);
    require(parent > 0, "The period referenced in doublespendProof was not submitted to bridge");
    (parent,,,) = bridge.periods(_consolidateProof[0]);
    require(parent > 0, "The period referenced in consolidateProof was not submitted to bridge");

    // check consolidate tx inclusion in the root chain block
    bytes32 txHash;
    bytes memory txData;
    (, txHash, txData) = TxLib.validateProof(32 * (_doublespendProof.length + 2) + 64, _consolidateProof);
    Verification memory verification = verifications[txHash];
    require(verification.startTime > 0, "Transaction not registered for verification");
    require(
      block.timestamp <= verification.startTime + (exitDuration / 2),
      "Transaction passed challenge duration"
    );
    // parse consolidate tx
    TxLib.Outpoint memory pointC = TxLib.parseTx(txData).ins[_consolidateInputIndex].outpoint;
    bytes32 doublespendTxHash;
    (, doublespendTxHash, txData) = TxLib.validateProof(96, _doublespendProof);
    // parse input tx
    TxLib.Outpoint memory pointD = TxLib.parseTx(txData).ins[_inputIndex].outpoint;
    require(doublespendTxHash != txHash, "consolidate and doublespend are same tx");
    require(
      pointC.hash == pointD.hash && pointC.pos == pointD.pos,
      "Doublespend is not a doublespend"
    );
    // award stake to challanger
    msg.sender.transfer(verification.stake);
    // delete invalid tx
    delete verifications[txHash];
  }

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

  function setExitDuration(uint256 _exitDuration) public ifAdmin {
    exitDuration = _exitDuration;
  }

  function startExit(
    bytes32[] memory _youngestInputProof, bytes32[] memory _proof,
    uint8 _outputIndex, uint8 _inputIndex
  ) public payable {
    require(msg.value >= exitStake, "Not enough ether sent to pay for exit stake");
    bytes32 parent;
    uint32 timestamp;
    (parent,,, timestamp) = bridge.periods(_proof[0]);
    require(parent > 0, "The referenced period was not submitted to bridge");

    if (_youngestInputProof.length > 0) {
      (parent,,, timestamp) = bridge.periods(_youngestInputProof[0]);
      require(parent > 0, "The referenced period was not submitted to bridge");
    }

    // check exiting tx inclusion in the root chain block
    bytes32 txHash;
    bytes memory txData;
    uint64 txPos;
    (txPos, txHash, txData) = TxLib.validateProof(32 * (_youngestInputProof.length + 2) + 64, _proof);

    // parse exiting tx and check if it is exitable
    TxLib.Tx memory exitingTx = TxLib.parseTx(txData);
    TxLib.Output memory out = exitingTx.outs[_outputIndex];

    bytes32 utxoId = bytes32(uint256(_outputIndex) << 120 | uint120(uint256(txHash)));
    require(out.owner == msg.sender, "Only UTXO owner can start exit");
    require(out.value > 0, "UTXO has no value");
    require(exits[utxoId].amount == 0, "The exit for UTXO has already been started");
    require(!exits[utxoId].finalized, "The exit for UTXO has already been finalized");

    uint256 priority;
    if (_youngestInputProof.length > 0) {
      // check youngest input tx inclusion in the root chain block
      bytes32 inputTxHash;
      (txPos, inputTxHash,) = TxLib.validateProof(96, _youngestInputProof);
      require(
        inputTxHash == exitingTx.ins[_inputIndex].outpoint.hash, 
        "Input from the proof is not referenced in exiting tx"
      );
      
      if (isNft(out.color)) {
        priority = (nftExitCounter << 128) | uint128(uint256(utxoId));
        nftExitCounter++;
      } else {      
        priority = getERC20ExitPriority(timestamp, utxoId, txPos);
      }
    } else {
      require(exitingTx.txType == TxLib.TxType.Deposit, "Expected deposit tx");
      if (isNft(out.color)) {
        priority = (nftExitCounter << 128) | uint128(uint256(utxoId));
        nftExitCounter++;
      } else {      
        priority = getERC20ExitPriority(timestamp, utxoId, txPos);
      }
    }

    tokens[out.color].insert(priority);

    exits[utxoId] = Exit({
      owner: out.owner,
      color: out.color,
      amount: out.value,
      finalized: false,
      stake: exitStake,
      priorityTimestamp: timestamp
    });
    emit ExitStarted(
      txHash, 
      _outputIndex, 
      out.color, 
      out.owner, 
      out.value
    );
  }

  function startDepositExit(uint256 _depositId) public payable {
    require(msg.value >= exitStake, "Not enough ether sent to pay for exit stake");
    // check that deposit exits
    Deposit memory deposit = deposits[uint32(_depositId)];
    require(deposit.owner == msg.sender, "Only deposit owner can start exit");
    require(deposit.amount > 0, "deposit has no value");
    require(exits[bytes32(_depositId)].amount == 0, "The exit of deposit has already been started");
    require(!exits[bytes32(_depositId)].finalized, "The exit for deposit has already been finalized");
    
    uint256 priority;
    if (isNft(deposit.color)) {
      priority = (nftExitCounter << 128) | uint128(_depositId);
      nftExitCounter++;
    } else {      
      priority = getERC20ExitPriority(uint32(deposit.time), bytes32(_depositId), 0);
    }

    tokens[deposit.color].insert(priority);

    exits[bytes32(_depositId)] = Exit({
      owner: deposit.owner,
      color: deposit.color,
      amount: deposit.amount,
      finalized: false,
      stake: exitStake,
      priorityTimestamp: uint32(now)
    });
    emit ExitStarted(
      bytes32(_depositId), 
      0, 
      deposit.color, 
      deposit.owner, 
      deposit.amount
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

    if (currentExit.owner != address(0) || currentExit.amount != 0) { // exit was removed
      // Note: for NFTs, the amount is actually the NFT id (both uint256)
      if (isNft(currentExit.color)) {
        tokens[currentExit.color].addr.transferFrom(address(this), currentExit.owner, currentExit.amount);
      } else {
        tokens[currentExit.color].addr.approve(address(this), currentExit.amount);
        tokens[currentExit.color].addr.transferFrom(address(this), currentExit.owner, currentExit.amount);
      }
      // Pay exit stake
      address(uint160(currentExit.owner)).transfer(currentExit.stake);
    }

    tokens[currentExit.color].delMin();
    exits[utxoId].finalized = true;
  }

  function challengeExit(
    bytes32[] memory _proof, 
    bytes32[] memory _prevProof, 
    uint8 _outputIndex,
    uint8 _inputIndex
  ) public {
    // validate exiting tx
    uint256 offset = 32 * (_proof.length + 2);
    bytes32 txHash1;
    bytes memory txData;
    (, txHash1, txData) = TxLib.validateProof(offset + 64, _prevProof);
    bytes32 utxoId = bytes32(uint256(_outputIndex) << 120 | uint120(uint256(txHash1)));
    
    TxLib.Tx memory txn;
    if (_proof.length > 0) {
      // validate spending tx
      bytes32 txHash;
      (, txHash, txData) = TxLib.validateProof(96, _proof);
      txn = TxLib.parseTx(txData);

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
      } else {
        // check that transaction verified
        uint256 verificationTime = verifications[txHash].startTime;
        require(verificationTime > 0, "Transaction not verified");
        require(block.timestamp >= verificationTime + (exitDuration / 2), "Transaction still in verification");

        // if consolidate, make sure owner matches
        if (txn.txType == TxLib.TxType.Consolidate) {
          require(exits[utxoId].owner == txn.outs[0].owner);
        } else {
          revert("unknown tx type");
        }
      }
    } else {
      // challenging deposit exit
      txn = TxLib.parseTx(txData);
      utxoId = txn.ins[_inputIndex].outpoint.hash;
      if (txn.txType == TxLib.TxType.Deposit) {
        // check that deposit was included correctly
        // only then it should be usable for challenge
        Deposit memory deposit = deposits[uint32(uint256(utxoId))];
        require(deposit.amount == txn.outs[0].value, "value mismatch");
        require(deposit.owner == txn.outs[0].owner, "owner mismatch");
        require(deposit.color == txn.outs[0].color, "color mismatch");
        // todo: check timely inclusion of deposit tx
        // this will prevent grieving attacks by the operator
      } else {
        revert("unexpected tx type");
      }
    }

    require(exits[utxoId].amount > 0, "exit not found");
    require(!exits[utxoId].finalized, "The exit has already been finalized");

    // award stake to challanger
    msg.sender.transfer(exits[utxoId].stake);
    // delete invalid exit
    delete exits[utxoId];
  }

  function challengeYoungestInput(
    bytes32[] memory _youngerInputProof,
    bytes32[] memory _exitingTxProof, 
    uint8 _outputIndex, 
    uint8 _inputIndex
  ) public {
    // validate exiting input tx
    bytes32 txHash;
    bytes memory txData;
    (, txHash, txData) = TxLib.validateProof(32 * (_youngerInputProof.length + 2) + 64, _exitingTxProof);
    bytes32 utxoId = bytes32(uint256(_outputIndex) << 120 | uint120(uint256(txHash)));

    // check the exit exists
    require(exits[utxoId].amount > 0, "There is no exit for this UTXO");

    TxLib.Tx memory exitingTx = TxLib.parseTx(txData);

    // validate younger input tx
    (,txHash,) = TxLib.validateProof(96, _youngerInputProof);
    
    // check younger input is actually an input of exiting tx
    require(txHash == exitingTx.ins[_inputIndex].outpoint.hash, "Given output is not referenced in exiting tx");
    
    bytes32 parent;
    uint32 youngerInputTimestamp;
    (parent,,,youngerInputTimestamp) = bridge.periods(_youngerInputProof[0]);
    require(parent > 0, "The referenced period was not submitted to bridge");

    require(exits[utxoId].priorityTimestamp < youngerInputTimestamp, "Challenged input should be older");

    // award stake to challanger
    msg.sender.transfer(exits[utxoId].stake);
    // delete invalid exit
    delete exits[utxoId];
  }

  function getNextExit(uint16 _color) internal view returns (bytes32 utxoId, uint256 exitableAt) {
    uint256 priority = tokens[_color].getMin();
    utxoId = bytes32(uint256(uint128(priority)));
    exitableAt = priority >> 192;
  }

  function isNft(uint16 _color) internal pure returns (bool) {
    return _color > 32768; // 2^15
  }

  function getERC20ExitPriority(
    uint32 timestamp, bytes32 utxoId, uint64 txPos
  ) internal view returns (uint256 priority) {
    uint256 exitableAt = Math.max(timestamp + (2 * exitDuration), block.timestamp + exitDuration);
    return (exitableAt << 192) | uint256(txPos) << 128 | uint128(uint256(utxoId));
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

  // solium-disable-next-line mixedcase
  uint256[50] private ______gap;
}
