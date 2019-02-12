
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

  event LimboExitStarted(bytes32 indexed exitId, uint256 color);
  event LimboExitChallengePublished(bytes32 indexed exitId, address indexed _from, uint8 _challengeNumber, uint8 _inputNumber);

  struct Exit {
    uint256 amount;
    uint16 color;
    address owner;
    bool finalized;
    uint32 priorityTimestamp;
    uint256 stake;
    bool isLimbo;
  }

  struct LimboExit {
    LimboIn[] input;
    LimboOut[] output;
    bool finalized;
    address exitor;
    bool isValid; // a tx is valid if it is canonical and exitable and comes from valid txs
  }

  struct LimboIn {
    uint256 amount;
    address owner;
    bool isPegged;
    bool exitable;
    LimboChallenge challenge;
  }

  struct LimboOut {
    uint256 amount;
    address owner;
    bool isPegged;
    uint256 color;
    bool exitable;
    LimboChallenge challenge;
    // bytes32 utxoId;
  }

  struct LimboChallenge {
    address owner;
    bool resolved;
    bytes32[] proof;
  }

  uint256 public exitDuration;
  uint256 public limboPeriod;
  uint256 public piggybackStake;
  uint256 public challengeStake;
  uint256 public exitStake;
  uint256 public nftExitCounter;

  uint256 public constant LimboJoinDelay = (12 seconds);

  /**
   * UTXO → Exit mapping. Contains exits for both NFT and ERC20 colors
   */
  mapping(bytes32 => Exit) public exits;
  mapping(bytes32 => LimboExit) public limboExits;
  mapping(bytes22 => bool) public succesfulLimboExits;

  function initializeWithExit(
    Bridge _bridge, 
    uint256 _exitDuration, 
    uint256 _exitStake,
    uint256 _piggybackStake,
    uint256 _challengeStake,
    uint256 _limboPeriod) public initializer {
    initialize(_bridge);
    exitDuration = _exitDuration;
    exitStake = _exitStake;
    challengeStake = _challengeStake;
    piggybackStake = _piggybackStake;
    limboPeriod = _limboPeriod;
    emit MinGasPrice(0);
  }

  function setExitStake(uint256 _exitStake) public ifAdmin {
    exitStake = _exitStake;
  }

  function setPiggybackStake(uint256 _piggybackStake) public ifAdmin {
    piggybackStake = _piggybackStake;
  }

  function setChallengeStake(uint256 _challengeStake) public ifAdmin {
    challengeStake = _challengeStake;
  }

  function setExitDuration(uint256 _exitDuration) public ifAdmin {
    exitDuration = _exitDuration;
  }

  function startLimboExit(bytes memory inTxData, bytes32[] memory _youngestInputProof) public payable returns (bytes32 utxoId) { 

    // exitor assumes tx to be canonical
    require(msg.value >= exitStake, "Not enough ether sent to pay for exit stake");
    TxLib.Tx memory transferTx = TxLib.parseTx(inTxData);
    uint8 _outputIndex = 0;
    
    mapping(uint8 => LimboIn) storage inputs;
    mapping(uint8 => LimboOut) storage outputs;

    for (uint8 i =0; i < transferTx.outs.length; i++){
      TxLib.Output memory outs = transferTx.outs[i];
      outputs[i] = LimboOut({
        amount: outs.value, 
        owner: outs.owner, 
        isPegged: false, 
        color: outs.color, 
        exitable: true,
        challenge: {}
        // utxoId: bytes32(uint256(i) << 120 | uint120(uint256(inTxHash))); });
    });
    for (uint8 i =0; i < transferTx.ins.length; i++){
      TxLib.Input memory ins = transferTx.ins[i];
      TxLib.Output memory out = transferTx.outs[ins.outpoint.pos];
      inputs[i] = LimboIn({
        amount: out.value,
        owner: out.owner, 
        isPegged: false, 
        exitable: true,
        challenge: {}
      });
    }
    
    bytes32 inTxHash = keccak256(inTxData);
    bytes32 utxoId = bytes32(uint256(_outputIndex) << 120 | uint120(uint256(inTxHash)));
    uint256 priority;
    uint32 height;
    uint32 timestamp;

    // priority based on youngestInput
    if (_youngestInputProof.length > 0) {
      (height, timestamp) = bridge.periods(_youngestInputProof[0]);
      require(timestamp > 0, "The referenced period was not submitted to bridge");
    }
    bytes32 inputTxHash;
    uint64 txPos;
    (txPos, inputTxHash,) = TxLib.validateProof(96, _youngestInputProof);

    if (isNft(outs.color)) {
      priority = (nftExitCounter << 128) | uint128(uint256(utxoId));
      nftExitCounter++;
    } else {      
      priority = getERC20ExitPriority(timestamp, utxoId, txPos);
    }
    limboExits[utxoId] = LimboExit({
      input: inputs,
      output: outputs,
      finalized: false,
      exitor: msg.sender,
      isValid: true
    });

    emit LimboExitStarted(
      inTxHash, 
      outs.color
    );
    tokens[outs.color].insert(priority);

    return utxoId;
  }

  }

  function joinLimboExit(
    bytes32 exitId, uint8 _index) 
    public payable {
    require(msg.value >= piggybackStake, "Not enough ether sent to join the exit");

    address owner = msg.sender;
    LimboExit memory limboExit = limboExits[exitId];

    if (limboExit.input[_index].owner == owner){
      // input is piggybacking
      require(limboExit.input[_index].isPegged = false, "Already joined the exit");

      limboExit.input[_index].isPegged = true;
    } else if (limboExit.output[_index].owner == owner) {
      // output is piggybacking
      require(limboExit.output[_index].isPegged = false, "Already joined the exit");

      limboExit.output[_index].isPegged = true;
    }
  
  }

  function challengeLimboExitByInclusionProof(
    bytes32 exitId, bytes memory inTxData,
    uint8 InputNo, bytes32[] memory _youngestInputProof, bytes32[] memory  _inclusionProof) 
    public payable {
    require(msg.value >= challengeStake, "Not enough ether sent to challenge exit");
    LimboExit memory limboExit = limboExits[exitId];
    
    bytes32 inTxHash = keccak256(inTxData);
    require(limboExit.isValid == true);
    TxLib.Tx memory transferTx = TxLib.parseTx(inTxData);
    
    bytes32 txHash;
    bytes memory txData;
    uint64 txPos;
    (txPos, txHash, txData) = TxLib.validateProof(32 * (_youngestInputProof.length + 2) + 64, _inclusionProof);

    require(inTxHash == txHash, "Invalid inclusion proof");

    limboExit.isValid = false;
    limboExit.input[InputNo].exitable = false;
    limboExit.input[InputNo].challenge = LimboChallenge({
    owner: msg.sender,
    resolved: false,
    proof: _inclusionProof
    });  
  }

  function challengeLimboExitByInputSpend(
    bytes32 exitId,
    bytes memory inTxData, uint8 InputNo, uint8 _spendInputNo,
    bytes32[] memory  _youngestInputProof, bytes32[] memory _spendProof) 
    public payable {
    require(msg.value >= challengeStake, "Not enough ether sent to challenge exit");
    LimboExit memory limboExit = limboExits[exitId];
    bytes32 inTxHash = keccak256(inTxData);

    bytes32 competingHash;
    bytes memory competingTxData;
    uint32 blockHeight;
    uint64 competingPos;

    TxLib.Tx memory transferTx = TxLib.parseTx(inTxData);
    (competingPos, competingHash, competingTxData) = TxLib.validateProof(32 * (_youngestInputProof.length + 2) + 64, _spendProof);
    TxLib.Tx memory competingTx = TxLib.parseTx(competingTxData);

    blockHeight = bridge.periods[_spendProof[0]].height;
    
    // if canonical till now
    
    if (limboExit.isValid == true){
      TxLib.Input memory inInput = transferTx.ins[InputNo];
      TxLib.Input memory competingInput = competingTx.ins[_spendInputNo];
      // proving non-canonical
      // if same inputs, add challenge
      require(inInput.r == competingInput.r);
      require(inInput.s == competingInput.s);
      require(inInput.v == competingInput.v);

    } else {

      // if someone challenged it before and became successful
      bytes32 previousHash;
      bytes memory previousTxData;
      uint64 previousPos;
      LimboChallenge memory prevChallenge = limboExit.challenge;
      bytes memory _prevProof = prevChallenge.proof;
      (previousPos, previousHash, previousTxData) = TxLib.validateProof(32 * (_youngestInputProof.length + 2) + 64, _prevProof);
      TxLib.Tx memory previousTx = TxLib.parseTx(previousTxData);
      uint32 prevHeight = bridge.periods[_prevProof[0]].height;
      
      require(blockHeight < prevHeight);
      // pay challengeStake to winner from exitHandler
      tokens[transferTx.outs[0].color].addr.transferFrom(address(this), msg.sender, challengeStake);

    }
    limboExit.isValid = false;
    limboExit.input[InputNo].exitable = false;
    limboExit.challenge = LimboChallenge({
      owner: msg.sender,
      resolved: false,
      proof: _spendProof
    });
  }

  function challengeLimboExitByOutputSpend(
    bytes32 exitId,
    bytes memory inTxData, uint8 OutputNo,
    bytes memory _youngestInputProof, bytes memory _spendProof, uint8 InputNo) 
    public payable {
    require(msg.value >= challengeStake, "Not enough ether sent to challenge exit");
    LimboExit memory limboExit = limboExits[exitId];
    bytes32 inTxHash = keccak256(inTxData);

    bytes32 competingHash;
    bytes memory competingTxData;
    uint64 competingPos;
    
    TxLib.Tx memory transferTx = TxLib.parseTx(inTxData);
    (competingPos, competingHash, competingTxData) = TxLib.validateProof(32 * (_youngestInputProof.length + 2) + 64, _spendProof);
    TxLib.Tx memory competingTx = TxLib.parseTx(competingTxData);

    uint32 blockHeight = bridge.periods[_spendProof[0]].height;

    if (limboExit.isValid == true){
      uint256 offset = uint8(uint256(_spendProof[1] >> 248));
      // getting spendTx input address
      address owner = TxLib.recoverTxSigner(offset, _spendProof);      
      LimboOut memory inOutput = limboExit.output[OutputNo];
      TxLib.Input memory competingInput = competingTx.input[InputNo];

      // check if same or not ?      
      require(inOutput.owner == owner);
      require(inOutput.amount == competingTx.outs[competingInput.outpoint.pos]);

    } else {
      // if someone challenged it before and became successful
      LimboChallenge memory prevChallenge = limboExit.challenge;
      bytes32[] memory _prevProof = prevChallenge.proof;
      uint64 previousPos;
      bytes32 previousHash;
      bytes memory previousTxData;

      (previousPos, previousHash, previousTxData) = TxLib.validateProof(32 * (_youngestInputProof.length + 2) + 64, _prevProof);
      TxLib.Tx memory previousTx = TxLib.parseTx(previousTxData);      
      uint32 prevHeight = bridge.periods[_prevProof[0]].height;

      require(blockHeight < prevHeight);
      tokens[transferTx.outs[0].color].addr.transferFrom(address(this), msg.sender, challengeStake);

    }
    limboExit.isValid = false;
    limboExit.output[OutputNo].exitable = false;
    limboExit.challenge = LimboChallenge({
      owner: msg.sender,
      resolved: false,
      proof: _spendProof
    });
  }

  function resolveInputSpendChallenge(
    bytes32 exitId, bytes memory inTxData, uint8 InputNo,
    bytes32[] memory _txProof, bytes32[] memory _youngestInputProof
  ) public {
    LimboExit memory limboExit = limboExits[exitId];
    LimboChallenge memory challenge = limboExit.input[InputNo].challenge;
    bytes32[] memory _prevProof = challenge.proof;
    TxLib.Tx memory transferTx = TxLib.parseTx(inTxData);
    bytes32 inTxHash = keccak256(inTxData);

    bytes32 previousHash;
    bytes memory previousTxData;
    uint64 previousPos;

    (previousPos, previousHash, previousTxData) = TxLib.validateProof(32 * (_youngestInputProof.length + 2) + 64, _prevProof);
    TxLib.Tx memory previousTx = TxLib.parseTx(previousTxData);      
    uint32 prevHeight = bridge.periods[_prevProof[0]].height;

    uint32 blockHeight = bridge.periods[_txProof[0]].height;
    require(blockHeight < prevHeight);

    limboExit.isValid = true;
    limboExit.input[InputNo].exitable = true;
    limboExit.input[InputNo].challenge.resolved = true;
    //[TODO] pay resolver exitStake
  }

  function finalizeTopLimboExit(uint16 _color) public {
    bytes32 utxoId;
    uint256 exitableAt;
    (utxoId, exitableAt) = getNextExit(_color);

    require(exitableAt <= block.timestamp, "The top exit can not be exited yet");
    require(tokens[_color].currentSize > 0, "The exit queue for color is empty");

    LimboExit memory currentExit = limboExits[utxoId];
    uint256 amount;
    if (currentExit.isValid == true){
      // all piggybacked outputs are paid out
      for(uint8 i=0; i < currentExit.output.length; i++){
        LimboOut memory out = currentExit.output[i];
        if (out.exitable){
          amount = piggybackStake + out.amount;
          tokens[out.color].addr.transferFrom(address(this), out.owner, amount);
        }
      }
    } else {
      // all piggybacked inputs are paid out
      for(uint8 i=0; i < currentExit.input.length; i++){
        LimboIn memory input = currentExit.input[i];
        if (input.exitable){
          amount = piggybackStake + input.amount;
          tokens[input.color].addr.transferFrom(address(this), input.owner, amount);
        }
      }
    }
    delete limboExits[utxoId];
  }

  function startExit(
    bytes32[] memory _youngestInputProof, bytes32[] memory _proof,
    uint8 _outputIndex, uint8 _inputIndex
  ) public payable {
    require(msg.value >= exitStake, "Not enough ether sent to pay for exit stake");
    uint32 timestamp;
    (, timestamp) = bridge.periods(_proof[0]);
    require(timestamp > 0, "The referenced period was not submitted to bridge");

    if (_youngestInputProof.length > 0) {
      (, timestamp) = bridge.periods(_youngestInputProof[0]);
      require(timestamp > 0, "The referenced period was not submitted to bridge");
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
        revert("unknown tx type");
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
    
    uint32 youngerInputTimestamp;
    (,youngerInputTimestamp) = bridge.periods(_youngerInputProof[0]);
    require(youngerInputTimestamp > 0, "The referenced period was not submitted to bridge");

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

  // solium-disable-next-line mixedcase
  uint256[50] private ______gap;
}
