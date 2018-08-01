
/**
 * Copyright (c) 2017-present, Parsec Labs (parseclabs.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity ^0.4.19;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/math/Math.sol";
import "./PriorityQueue.sol";
import "./TxLib.sol";

contract ParsecBridge {
  using SafeMath for uint256;
  using TxLib for TxLib.Outpoint;
  using TxLib for TxLib.Output;
  using PriorityQueue for PriorityQueue.Token;

  event Epoch(uint256 epoch);
  event NewHeight(uint256 blockNumber, bytes32 indexed root);
  event NewDeposit(uint32 indexed depositId, address indexed depositor, uint256 indexed color, uint256 amount);
  event ExitStarted(bytes32 indexed txHash, uint256 indexed outIndex, uint256 indexed color, address exitor, uint256 amount);
  event ValidatorJoin(address indexed signerAddr, uint256 indexed slotId, bytes32 indexed tenderAddr, uint256 eventCounter, uint256 epoch);
  event ValidatorLogout(address indexed signerAddr, uint256 indexed slotId, bytes32 indexed tenderAddr, address newSigner, uint256 eventCounter, uint256 epoch);
  event ValidatorLeave(address indexed signerAddr, uint256 indexed slotId, bytes32 indexed tenderAddr, uint256 epoch);
  event ValidatorUpdate(address indexed signerAddr, uint256 indexed slotId, bytes32 indexed tenderAddr, uint256 eventCounter);

  bytes32 constant genesis = 0x4920616d207665727920616e6772792c20627574206974207761732066756e21; // "I am very angry, but it was fun!" @victor
  uint256 public epochLength; // length of epoch in periods (32 blocks)
  uint256 public lastCompleteEpoch; // height at which last epoch was completed
  uint256 lastEpochBlockHeight;
  uint256 parentBlockInterval; // how often epochs can be submitted max
  uint64 lastParentBlock; // last ethereum block when epoch was submitted
  uint256 maxReward; // max reward per period
  uint256 public averageGasPrice; // collected gas price for last submitted blocks
  uint256 exitDuration;
  bytes32 public tipHash; // hash of first period that has extended chain to some height

  mapping(uint16 => PriorityQueue.Token) public tokens;
  mapping(address => bool) tokenColors;
  uint16 public tokenCount = 0;

  struct Slot {
    uint32 eventCounter;
    address owner;
    uint64 stake;
    address signer;
    bytes32 tendermint;
    uint32 activationEpoch;
    address newOwner;
    uint64 newStake;
    address newSigner;
    bytes32 newTendermint;
  }

  mapping(uint256 => Slot) public slots;

  struct Period {
    bytes32 parent; // the id of the parent node
    uint32 height;  // the height of last block in period
    uint32 parentIndex; //  the position of this node in the Parent's children list
    uint8 slot;
    uint32 timestamp;
    uint64 reward;
    bytes32[] children; // unordered list of children below this node
  }
  mapping(bytes32 => Period) public periods;

  struct Deposit {
    uint64 height;
    uint16 color;
    address owner;
    uint256 amount;
  }
  mapping(uint32 => Deposit) public deposits;
  uint32 depositCount = 0;

  struct Exit {
    uint64 amount;
    uint16 color;
    address owner;
  }
  mapping(bytes32 => Exit) public exits;


  constructor(uint256 _epochLength, uint256 _maxReward, uint256 _parentBlockInterval, uint256 _exitDuration) public {
    // init genesis preiod
    Period memory genesisPeriod;
    genesisPeriod.parent = genesis;
    genesisPeriod.height = 32;
    genesisPeriod.timestamp = uint32(block.timestamp);
    tipHash = genesis;
    periods[tipHash] = genesisPeriod;
    // epochLength and at the same time number of validator slots
    require(_epochLength < 256);
    require(_epochLength >= 2);
    epochLength = _epochLength;
    // full period reward before taxes and adjustments
    maxReward = _maxReward;
    // parent block settings
    parentBlockInterval = _parentBlockInterval;
    lastParentBlock = uint64(block.number);
    exitDuration = _exitDuration;
  }

  function registerToken(ERC20 _token) public {
    require(_token != address(0));
    require(!tokenColors[_token]);
    uint256[] memory arr = new uint256[](1);
    tokenColors[_token] = true;
    tokens[tokenCount++] = PriorityQueue.Token({
      addr: _token,
      heapList: arr,
      currentSize: 0
    });
  }

  function getSlot(uint256 _slotId) constant public returns (uint32, address, uint64, address, bytes32, uint32, address, uint64, address, bytes32) {
    require(_slotId < epochLength);
    Slot memory slot = slots[_slotId];
    return (slot.eventCounter, slot.owner, slot.stake, slot.signer, slot.tendermint, slot.activationEpoch, slot.newOwner, slot. newStake, slot.newSigner, slot.newTendermint);
  }


  // data = [winnerHash, claimCountTotal, operator, operator ...]
  // operator: 1b claimCountByOperator - 10b 0x - 1b stake - 20b address
  function dfs(bytes32[] _data, bytes32 _nodeHash) internal constant returns(bytes32[] data) {
    Period memory node = periods[_nodeHash];
    // visit this node
    data = new bytes32[](_data.length);
    for (uint256 i = 1; i < _data.length; i++) {
      data[i] = _data[i];
    }
    // find the operator that mined this block
    i = node.slot + 2;
    // if operator can claim rewards, assign
    if (uint256(data[i]) == 0) {
      data[i] = bytes32(1);
      data[1] = bytes32(uint256(data[1]) + (1 << 128));
      data[0] = _nodeHash;
    }
    // more of tree to walk
    if (node.children.length > 0) {
      bytes32[][] memory options = new bytes32[][](data.length);
      for (i = 0; i < node.children.length; i++) {
        options[i] = dfs(data, node.children[i]);
      }
      for (i = 0; i < node.children.length; i++) {
        // compare options, return the best
        if (uint256(options[i][1]) > uint256(data[1])) {
          data[0] = options[i][0];
          data[1] = options[i][1];
        }
      }
    }
    else {
      data[0] = _nodeHash;
      data[1] = bytes32(uint256(data[1]) + 1);
    }
    // else - reached a tip
    // return data
  }

  function getTip() public constant returns (bytes32, uint256) {
    // find consensus horizon
    bytes32 consensusHorizon = periods[tipHash].parent;
    uint256 depth = (periods[tipHash].height < epochLength * 32) ? 1 : periods[tipHash].height - (epochLength * 32);
    depth += 32;
    while(periods[consensusHorizon].height > depth) {
      consensusHorizon = periods[consensusHorizon].parent;
    }
    // create data structure for depth first search
    bytes32[] memory data = new bytes32[](epochLength + 2);
    // run search
    bytes32[] memory rsp = dfs(data, consensusHorizon);
    // return result
    return (rsp[0], uint256(rsp[1]) >> 128);
  }

  function bet(uint256 _slotId, uint256 _value, address _signerAddr, bytes32 _tenderAddr, address _owner) public {
    require(_slotId < epochLength);
    Slot storage slot = slots[_slotId];
    // take care of logout
    if (_value == 0 && slot.newStake == 0 && slot.signer == _signerAddr) {
      slot.activationEpoch = uint32(lastCompleteEpoch.add(3));
      slot.eventCounter++;
      emit ValidatorLogout(slot.signer, _slotId, _tenderAddr, 0x0, slot.eventCounter, lastCompleteEpoch + 3);
      return;
    }
    // check min stake
    uint required = slot.stake;
    if (slot.newStake > required) {
      required = slot.newStake;
    }
    required = required.mul(105).div(100);
    require(required < _value);

    // new purchase or update
    if (slot.stake == 0 || (slot.owner == _owner && slot.newStake == 0)) {
      uint64 stake = slot.stake;
      tokens[0].addr.transferFrom(_owner, this, _value - slot.stake);
      slot.owner = _owner;
      slot.signer = _signerAddr;
      slot.tendermint = _tenderAddr;
      slot.stake = uint64(_value);
      slot.activationEpoch = 0;
      slot.eventCounter++;
      if (stake == 0) {
        emit ValidatorJoin(slot.signer, _slotId, _tenderAddr, slot.eventCounter, lastCompleteEpoch + 1);
      } else {
        emit ValidatorUpdate(slot.signer, _slotId, _tenderAddr, slot.eventCounter);
      }
    }
    // auction
    else {
      if (slot.newStake > 0) {
        tokens[0].addr.transfer(slot.newOwner, slot.newStake);
      }
      tokens[0].addr.transferFrom(_owner, this, _value);
      slot.newOwner = _owner;
      slot.newSigner = _signerAddr;
      slot.newTendermint = _tenderAddr;
      slot.newStake = uint64(_value);
      slot.activationEpoch = uint32(lastCompleteEpoch.add(3));
      slot.eventCounter++;
      emit ValidatorLogout(slot.signer, _slotId, _tenderAddr, _signerAddr, slot.eventCounter, lastCompleteEpoch + 3);
    }
  }

  function activate(uint256 _slotId) public {
    require(_slotId < epochLength);
    Slot storage slot = slots[_slotId];
    require(lastCompleteEpoch + 1 >= slot.activationEpoch);
    if (slot.stake > 0) {
      tokens[0].addr.transfer(slot.owner, slot.stake);
      emit ValidatorLeave(slot.signer, _slotId, slot.tendermint, lastCompleteEpoch + 1);
    }
    slot.owner = slot.newOwner;
    slot.signer = slot.newSigner;
    slot.tendermint = slot.newTendermint;
    slot.stake = slot.newStake;
    slot.activationEpoch = 0;
    slot.newOwner = 0;
    slot.newSigner = 0;
    slot.newTendermint = 0x0;
    slot.newStake = 0;
    slot.eventCounter++;
    if (slot.stake > 0) {
      emit ValidatorJoin(slot.signer, _slotId, slot.tendermint, slot.eventCounter, lastCompleteEpoch + 1);
    }
  }

  function recordGas() internal {
    averageGasPrice = averageGasPrice - (averageGasPrice / 15) + (tx.gasprice / 15);
  }

  function submitPeriod(uint256 _slotId, bytes32 _prevHash, bytes32 _root) public {
    // check parent node exists
    require(periods[_prevHash].parent > 0);
    // check that same root not submitted yet
    require(periods[_root].height == 0);
    // check slot
    require(_slotId < epochLength);
    Slot storage slot = slots[_slotId];
    require(slot.signer == msg.sender);
    if (slot.activationEpoch > 0) {
      // if slot not active, prevent submission
      require(lastCompleteEpoch.add(2) < slot.activationEpoch);
    }

    // calculate height
    uint256 newHeight = periods[_prevHash].height + 32;
    // do some magic if chain extended
    if (newHeight > periods[tipHash].height) {
      // new periods can only be submitted every x Ethereum blocks
      require(block.number >= lastParentBlock + parentBlockInterval);
      tipHash = _root;
      lastParentBlock = uint64(block.number);
	    // record gas
	    recordGas();
      emit NewHeight(newHeight, _root);
    }
    // store the period
    Period memory newPeriod;
    newPeriod.parent = _prevHash;
    newPeriod.height = uint32(newHeight);
    newPeriod.slot = uint8(_slotId);
    newPeriod.timestamp = uint32(block.timestamp);
    newPeriod.parentIndex = uint32(periods[_prevHash].children.push(_root) - 1);
    periods[_root] = newPeriod;

    // distribute rewards
    uint256 totalSupply = tokens[0].addr.totalSupply();
    uint256 stakedSupply = tokens[0].addr.balanceOf(this);
    uint256 reward = maxReward;
    if (stakedSupply >= totalSupply.div(2)) {
      // 4 x br x as x (ts - as)
      // -----------------------
      //        ts x ts
      reward = totalSupply.sub(stakedSupply).mul(stakedSupply).mul(maxReward).mul(4).div(totalSupply.mul(totalSupply));
    }
    slot.stake += uint64(reward);

    // check if epoch completed
    if (newHeight >= lastEpochBlockHeight.add(epochLength.mul(32))) {
      lastCompleteEpoch++;
      lastEpochBlockHeight = newHeight;
    }
  }

  function deletePeriod(bytes32 hash) internal {
    Period storage parent = periods[periods[hash].parent];
    uint256 i = periods[hash].parentIndex;
    if (i < parent.children.length - 1) {
      // swap with last child
      parent.children[i] = parent.children[parent.children.length - 1];
    }
    parent.children.length--;
    if (hash == tipHash) {
      tipHash = periods[hash].parent;
    }
    delete periods[hash];
  }

  function readInvalidDepositProof(
    bytes32[] _txData
  ) public pure returns (
    uint32 depositId,
    uint64 value,
    address signer
  ) {
    depositId = uint32(_txData[2] >> 240);
    value = uint64(_txData[2] >> 176);
    signer = address(_txData[2]);
  }


  /*
   * _txData = [ 32b periodHash, (1b Proofoffset, 8b pos,  ..00.., 1b txData), 32b txData, 32b proof, 32b proof ]
   *
   * # 2 Deposit TX (33b)
   *   1b type
   *     4b depositId
   *     8b value, 2b color, 20b address
   *
   */
  function reportInvalidDeposit(bytes32[] _txData) public {
    Period memory p = periods[_txData[0]];
    if (periods[tipHash].height > epochLength) {
      require(p.height > periods[tipHash].height - epochLength);
    }
    // check transaction proof
    TxLib.validateProof(0, _txData);

    // check deposit values
    uint32 depositId;
    uint64 value;
    address signer;
    (depositId, value, signer) = readInvalidDepositProof(_txData);

    Deposit memory dep = deposits[depositId];
    require(value != dep.amount || signer != dep.owner);

    // delete invalid period
    deletePeriod(_txData[0]);
    // EVENT
    // slash operator
    slash(p.slot, 10 * maxReward);
    // reward 1 block reward
    tokens[0].addr.transfer(msg.sender, maxReward);
  }

  function reportDoubleSpend(bytes32[] _proof, bytes32[] _prevProof) public {
    Period memory p = periods[_proof[0]];

    // validate proofs
    uint256 offset = 32 * (_proof.length + 2);
    uint64 txPos1;
    (txPos1, , ) = TxLib.validateProof(offset, _prevProof);

    uint64 txPos2;
    (txPos2, , ) = TxLib.validateProof(32, _proof);

    // make sure transactions are different
    require(_proof[0] != _prevProof[0] || txPos1 != txPos2);

    // get iputs and validate
    bytes32 prevHash1;
    bytes32 prevHash2;
    uint8 outPos1;
    uint8 outPos2;
    assembly {
      //TODO: allow other than first inputId
      prevHash1 := calldataload(add(134, 32))
      outPos1 := calldataload(add(166, 32))
      prevHash2 := calldataload(add(134, offset))
      outPos2 := calldataload(add(166, offset))
    }

    // check that spending same outputs
    require(prevHash1 == prevHash2 && outPos1 == outPos2);
    // delete invalid period
    deletePeriod(_proof[0]);
    // EVENT
    // slash operator
    slash(p.slot, 50);
  }

  function slash(uint256 _slotId, uint256 _value) public {
    require(_slotId < epochLength);
    Slot storage slot = slots[_slotId];
    require(slot.stake > 0);
    uint256 prevStake = slot.stake;
    slot.stake = (_value >= slot.stake) ? 0 : slot.stake - uint64(_value);
    // if slot became empty by slashing
    if (prevStake > 0 && slot.stake == 0) {
      emit ValidatorLeave(slot.signer, _slotId, slot.tendermint, lastCompleteEpoch + 1);
      slot.activationEpoch = 0;
      if (slot.newStake > 0) {
        // someone in queue
        activate(_slotId);
      } else {
        // clean out account
        slot.owner = 0;
        slot.signer = 0;
        slot.tendermint = 0x0;
        slot.stake = 0;
      }
    }
  }

  /*
   * Add funds
   */
  function deposit(address _owner, uint256 _amount, uint16 _color) public {
    require(_color < tokenCount);
    tokens[_color].addr.transferFrom(_owner, this, _amount);
    depositCount++;
    deposits[depositCount] = Deposit({
      height: periods[tipHash].height,
      owner: _owner,
      color: _color,
      amount: _amount
    });
    emit NewDeposit(depositCount, _owner, _color, _amount);
  }

  function startExit(bytes32[] _proof, uint256 _oindex) public {
    // validate proof
    bytes32 txHash;
    bytes memory txData;
    (, txHash, txData) = TxLib.validateProof(32, _proof);
    // parse tx and use data
    TxLib.Output memory out = TxLib.parseTx(txData).outs[_oindex];
    uint256 exitable_at = Math.max256(periods[_proof[0]].timestamp + (2 * exitDuration), block.timestamp + exitDuration);
    bytes32 utxoId = bytes32((_oindex << 120) | uint120(txHash));
    uint256 priority = (exitable_at << 128) | uint128(utxoId);
    require(out.value > 0);
    require(exits[utxoId].amount == 0);
    tokens[out.color].insert(priority);
    exits[utxoId] = Exit({
      owner: out.owner,
      color: out.color,
      amount: out.value
    });
    emit ExitStarted(txHash, _oindex, out.color, out.owner, out.value);
  }

  function challengeExit(bytes32[] _proof, bytes32[] _prevProof, uint256 _oIndex, uint256 _inputIndex) public {
    // validate exiting tx
    uint256 offset = 32 * (_proof.length + 2);
    bytes32 txHash1;
    ( , txHash1, ) = TxLib.validateProof(offset + 64, _prevProof);
    bytes32 utxoId = bytes32((_oIndex << 120) | uint120(txHash1));

    require(exits[utxoId].amount > 0);

    // validate spending tx
    bytes memory txData;
    (, , txData) = TxLib.validateProof(96, _proof);
    TxLib.Outpoint memory outpoint = TxLib.parseTx(txData).ins[_inputIndex].outpoint;

    // make sure one is spending the other one
    require(txHash1 == outpoint.hash);
    require(_oIndex == outpoint.pos);

    // delete invalid exit
    delete exits[utxoId].owner;
    delete exits[utxoId].amount;
  }

  // @dev Loops through the priority queue of exits, settling the ones whose challenge
  // @dev challenge period has ended
  function finalizeExits(uint16 _color) public {
    bytes32 utxoId;
    uint256 exitable_at;
    (utxoId, exitable_at) = getNextExit(_color);

    Exit memory currentExit = exits[utxoId];
    while (exitable_at <= block.timestamp && tokens[currentExit.color].currentSize > 0) {
      currentExit = exits[utxoId];
      if (currentExit.owner != 0 || currentExit.amount != 0) { // exit was removed
        tokens[currentExit.color].addr.transfer(currentExit.owner, currentExit.amount);
      }
      tokens[currentExit.color].delMin();
      delete exits[utxoId].owner;
      delete exits[utxoId].amount;

      if (tokens[currentExit.color].currentSize > 0) {
        (utxoId, exitable_at) = getNextExit(_color);
      } else {
        return;
      }
    }
  }

  function getNextExit(uint16 _color) internal view returns (bytes32 utxoId, uint256 exitable_at) {
    uint256 priority = tokens[_color].getMin();
    utxoId = bytes32(uint128(priority));
    exitable_at = priority >> 128;
  }

}
