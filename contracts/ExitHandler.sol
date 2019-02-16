
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

  // event LimboExitStarted(bytes32 indexed txHash, uint256 indexed color, bytes32 indexed exitId);
  // event LimboExitChallengePublished(bytes32 indexed exitId, address indexed _from, uint8 _challengeNumber, uint8 _inputNumber);

  struct Exit {
    uint256 amount;
    uint16 color;
    address owner;
    bool finalized;
    uint256 stake;
    uint32 priorityTimestamp;
  }

  struct LimboExit {
    uint256 amount;
    uint16 color;
    address owner;
    bool finalized;
    uint256 priority;
    uint256 stake;
    address exitor;
    uint8 _outputIndex;
    bytes32 txHash;
  }

  struct LimboTx {
    LimboOut[] outputs;
    LimboIn[] inputs;
    bool isCanonical;
    // LimboIn[] inputs;
    bytes txnData;
  }

  // struct LimboExit {
  //   bool finalized;
  //   uint256 priority;
  //   uint256 stake;
  //   address exitor;
  //   uint256 amount;
  //   address owner;
  //   uint8 color;
  //   uint8 _outputIndex;
  //   bytes32 txHash;
  // }

  // struct LimboTx {
  //   LimboOut[] outputs;
  //   LimboInputChallenge[] challenges;
  // }

  struct LimboChallenge {
    address challenger;
    bool resolved;
    bytes32[] proof;
  }

  struct LimboOut {
    uint256 amount;
    address owner;
    bool isPegged;
    bool unspent;
    LimboChallenge challenge;
  }

  struct LimboIn {
    address owner;
    uint256 amount;
    // OutputId[] to;
    bool isPegged;
    LimboChallenge challenge;
  }

  // struct Outputidx {
  //   uint8 pos;
  // }

  // struct LimboInputChallenge {
  //   address challenger;
  //   bool resolved;
  //   uint8 _inputIndex;
  //   bytes32[] proof;
  // }

  uint256 public exitDuration;
  uint256 public limboPeriod;
  uint256 public piggybackStake;
  uint256 public challengeStake;
  uint256 public exitStake;
  uint256 public nftExitCounter;

  /**
   * UTXO → Exit mapping. Contains exits for both NFT and ERC20 colors
   */
  mapping(bytes32 => Exit) public exits;
  mapping(bytes32 => LimboExit) limboExits;
  mapping(bytes32 => LimboTx) limboTxns;
  // mapping(uint8 => LimboOut) txOuts;

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

  function startLimboExit(bytes memory inTxData, bytes32[] memory _youngestInputProof, uint8 _outputIndex) public payable returns (bytes32 utxoId) { 

    // exitor assumes tx to be canonical
    require(msg.value >= exitStake, "Not enough ether sent to pay for exit stake");
    TxLib.Tx memory transferTx = TxLib.parseTx(inTxData);
    
    TxLib.Output memory out = transferTx.outs[_outputIndex];

    LimboTx memory limboTx;
    limboTx.txn= transferTx;

    for (uint8 i =0; i < transferTx.outs.length; i++){
      TxLib.Output memory outs = transferTx.outs[i];
      LimboOut memory output;
      output.amount = outs.value; 
      output.owner = outs.owner; 
      output.isPegged = false;
      output.exitable = false;
      limboTx.outputs[i] = output;
      // txOuts[i] = output;
    }
    // limboTx.outputs= txOuts;

    // for (uint8 i =0; i < transferTx.ins.length; i++){
    //   TxLib.Input memory ins = transferTx.ins[i];
    //   TxLib.Output memory out = transferTx.outs[ins.outpoint.pos];
    //   inputs[i] = LimboIn({
    //     amount: out.value,
    //     owner: out.owner, 
    //     isPegged: false, 
    //     exitable: true,
    //     challenge: {}
    //   });

    bytes32 inTxHash = keccak256(inTxData);
    utxoId = bytes32(uint256(_outputIndex) << 120 | uint120(uint256(inTxHash)));
    uint256 priority;
    uint32 height;
    uint32 timestamp;

    // validate youngestinputproof
    bytes32 inputTxHash;
    uint64 txPos;
    (txPos, inputTxHash,) = TxLib.validateProof(96, _youngestInputProof);

    // priority based on youngestInput
    (height, timestamp) = bridge.periods(_youngestInputProof[0]);
    require(timestamp > 0, "The referenced period was not submitted to bridge");

    if (isNft(out.color)) {
      priority = (nftExitCounter << 128) | uint128(uint256(utxoId));
      nftExitCounter++;
    } else {      
      priority = getERC20ExitPriority(timestamp, utxoId, txPos);
    }

    LimboExit memory limboExit;
    limboExit.finalized= false;
    limboExit.priority= priority;
    limboExit.exitor= msg.sender;
    limboExit.amount= out.value;
    limboExit.owner= out.owner;
    limboExit.color= out.color;
    limboExit._outputIndex= _outputIndex;
    limboExit.txHash= inTxHash;    

    limboExits[utxoId] = limboExit;
    limboTxns[inTxHash] = limboTx;
    // emit LimboExitStarted(
    //   inTxHash, 
    //   out.color,
    //   utxoId
    // );
    tokens[out.color].insert(priority);

    return utxoId;
  }

  function joinLimboExit(
    bytes32 exitId, uint8 _outputIndex) 
    public payable {
    // honest owner of outputs will piggyback the exit if they also want to exit their funds
    require(msg.value >= piggybackStake, "Not enough ether sent to join the exit");

    address owner = msg.sender;

    // exitId is utxoId
    LimboExit memory limboExit = limboExits[exitId];
    bytes32 inTxHash = limboExit.txHash;
    LimboTx memory limboTx = limboTxns[inTxHash];
    
    if (limboTx.outputs[_outputIndex].owner == owner) {
        // output is piggybacking
      require(limboTx.outputs[_outputIndex].isPegged = false, "Already joined the exit");

      limboTx.outputs[_outputIndex].isPegged = true;
      limboTx.outputs[_outputIndex].exitable = true;
    }
  }

  function challengeLimboExitByInputSpend(
    bytes32 txHash,
    uint8 InputNo, uint8 _spendInputNo,
    bytes32[] memory _spendProof) 
    public payable {
    // challenging canonicity
    
    require(msg.value >= challengeStake, "Not enough ether sent to challenge exit");
    LimboTx memory limboTx = limboTxns[exitId];

    bytes32 competingHash;
    bytes memory competingTxData;
    uint32 blockHeight;
    uint64 competingPos;

    TxLib.Tx memory inputTx = TxLib.parseTx(limboTx.txnData);
    (competingPos, competingHash, competingTxData) = TxLib.validateProof(96, _spendProof);
    TxLib.Tx memory competingTx = TxLib.parseTx(competingTxData);

    blockHeight = bridge.periods[_spendProof[0]].height;
    
    // if canonical till now
    if (limboTx.isCanonical == true){
      TxLib.Input memory inInput = inputTx.ins[InputNo];
      TxLib.Input memory competingInput = competingTx.ins[_spendInputNo];
      // proving non-canonical
      // if same inputs, add challenge
      require(inInput.r == competingInput.r);
      require(inInput.s == competingInput.s);
      require(inInput.v == competingInput.v);
      limboTx.isCanonical = false;

    } else {

      // if someone challenged it before and became successful
      bytes32 previousHash;
      bytes memory previousTxData;
      uint64 previousPos;
      LimboChallenge memory prevChallenge = limboTx.inputs[InputNo].challenge;
      bytes memory _prevProof = prevChallenge.proof;
      (previousPos, previousHash, previousTxData) = TxLib.validateProof(96, _prevProof);
      TxLib.Tx memory previousTx = TxLib.parseTx(previousTxData);
      uint32 prevHeight = bridge.periods[_prevProof[0]].height;
      
      require(blockHeight < prevHeight);
      // pay challengeStake to winner from exitHandler
      // tokens[transferTx.outs[0].color].addr.transferFrom(address(this), msg.sender, challengeStake);

    }
    limboTx.inputs[InputNo].challenge = LimboChallenge({
      owner: msg.sender,
      resolved: false,
      proof: _spendProof
    });
  }

  function challengeLimboExitByInclusionProof(
    bytes32 txHash,
    bytes32[] memory _inclusionProof)
    public payable {
    require(msg.value >= challengeStake, "Not enough ether sent to challenge exit");
    LimboTx memory limboTx = limboTxns[txHash];

    // bytes32 competingHash;
    bytes memory competingTxData;
    // uint32 blockHeight;
    // uint64 competingPos;

    TxLib.Tx memory inputTx = TxLib.parseTx(limboTx.txnData);
    (,, competingTxData) = TxLib.validateProof(96, _inclusionProof);
    TxLib.Tx memory competingTx = TxLib.parseTx(competingTxData);
    bytes32 inTxHash = keccak256(competingTxData);
    
    require(inTxHash == txHash, "Invalid inclusion proof");

    limboTx.isCanonical = true;
  }


  function challengeLimboExitByOutputSpend(
    bytes32 txHash, uint8 outputNo, uint8 InputNo,
    bytes memory _spendProof) 
    public payable {
    require(msg.value >= challengeStake, "Not enough ether sent to challenge exit");
    LimboTx memory limboTx = limboTxns[inTxHash];
    LimboOut memory limboOut = limboTx.outputs[outputNo];

    TxLib.Tx memory transferTx = TxLib.parseTx(limboTx.txnData);
    (spendPos, spendHash, spendData) = TxLib.validateProof(96, _spendProof);

    if (limboOut.isPegged){
      if (limboOut.unspent) {
      uint256 offset = uint8(uint256(_spendProof[1] >> 248));
      // getting spendTx input address
      address owner = TxLib.recoverTxSigner(offset, _spendProof);      
      TxLib.Input memory competingInput = competingTx.ins[InputNo];

      // check if same or not ?      
      require(inOutput.owner == owner);
      require(inOutput.amount == competingTx.outs[competingInput.outpoint.pos]);
      }
      else{
        // if someone challenged it before and became successful
      bytes32 previousHash;
      bytes memory previousTxData;
      uint64 previousPos;
      LimboChallenge memory prevChallenge = limboTx.outputs[outputNo].challenge;
      bytes memory _prevProof = prevChallenge.proof;
      (previousPos, previousHash, previousTxData) = TxLib.validateProof(96, _prevProof);
      TxLib.Tx memory previousTx = TxLib.parseTx(previousTxData);
      uint32 prevHeight = bridge.periods[_prevProof[0]].height;
      
      require(blockHeight < prevHeight);
      }
    limboTxns[inTxHash].outputs[outputNo].unspent = false;
    limboTxns[inTxHash].outputs[outputNo].challenge = LimboChallenge({
      owner: msg.sender,
      resolved: false,
      proof: _spendProof
    });
    } 
  }

  // function resolveInputSpendChallenge(
  //   bytes32 exitId, bytes memory inTxData, uint8 InputNo,
  //   bytes32[] memory _txProof, bytes32[] memory _youngestInputProof
  // ) public {
  //   LimboExit memory limboExit = limboExits[exitId];
  //   LimboChallenge memory challenge = limboExit.input[InputNo].challenge;
  //   bytes32[] memory _prevProof = challenge.proof;
  //   TxLib.Tx memory transferTx = TxLib.parseTx(inTxData);
  //   bytes32 inTxHash = keccak256(inTxData);

  //   bytes32 previousHash;
  //   bytes memory previousTxData;
  //   uint64 previousPos;

  //   (previousPos, previousHash, previousTxData) = TxLib.validateProof(32 * (_youngestInputProof.length + 2) + 64, _prevProof);
  //   TxLib.Tx memory previousTx = TxLib.parseTx(previousTxData);      
  //   uint32 prevHeight = bridge.periods[_prevProof[0]].height;

  //   uint32 blockHeight = bridge.periods[_txProof[0]].height;
  //   require(blockHeight < prevHeight);

  //   limboExit.isValid = true;
  //   limboExit.input[InputNo].exitable = true;
  //   limboExit.input[InputNo].challenge.resolved = true;
  //   //[TODO] pay resolver exitStake
  // }

  function finalizeTopLimboExit(uint16 _color) public {
    bytes32 utxoId;
    uint256 exitableAt;
    (utxoId, exitableAt) = getNextExit(_color);

    require(exitableAt <= block.timestamp, "The top exit can not be exited yet");
    require(tokens[_color].currentSize > 0, "The exit queue for color is empty");

    LimboExit memory currentExit = limboExits[utxoId];
    bytes32 txHash = currentExit.txHash;
    LimboTx memory txn = limboTxns[txHash];
    if (txn.isCanonical){
      // unspent piggybacked outputs will exit
      for (uint8 i=0; i < txn.outputs.length; i++){
        if (txn.outputs[i].isPegged){
          if(txn.outputs[i].unspent){
            // output will exit the chain
          }
        }
      }
    } else {
      // unspent piggybacked inputs will exit
      for (uint8 i=0; i < txn.inputs.length; i++){
        if (txn.inputs[i].isPegged){
          if(txn.inputs[i].challenge.length == 0){
            // unchallenged inputs will exit the chain
          }
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
