
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

import "./Adminable.sol";
import "./Bridge.sol";

contract PoaOperator is Adminable {

  event Epoch(uint256 epoch);
  event EpochLength(uint256 epochLength);

  event ValidatorJoin(
    address indexed signerAddr,
    uint256 indexed slotId,
    bytes32 indexed tenderAddr,
    uint256 eventCounter,
    uint256 epoch
  );

  event ValidatorLogout(
    address indexed signerAddr,
    uint256 indexed slotId,
    bytes32 indexed tenderAddr,
    address newSigner,
    uint256 eventCounter,
    uint256 epoch
  );

  event ValidatorLeave(
    address indexed signerAddr,
    uint256 indexed slotId,
    bytes32 indexed tenderAddr,
    uint256 epoch
  );

  event ValidatorUpdate(
    address indexed signerAddr,
    uint256 indexed slotId,
    bytes32 indexed tenderAddr,
    uint256 eventCounter
  );

  struct Slot {
    uint32 eventCounter;
    address signer;
    bytes32 tendermint;
    uint32 activationEpoch;
    address newSigner;
    bytes32 newTendermint;
  }

  Bridge public bridge;

  uint256 public epochLength; // length of epoch in periods (32 blocks)
  uint256 public lastCompleteEpoch; // height at which last epoch was completed
  uint256 public lastEpochBlockHeight;

  mapping(uint256 => Slot) public slots;

  function initialize(Bridge _bridge, uint256 _epochLength) public initializer {
    bridge = _bridge;
    epochLength = _epochLength;
    emit EpochLength(epochLength);
  }

  function setEpochLength(uint256 _epochLength) public ifAdmin {
    epochLength = _epochLength;
    emit EpochLength(epochLength);
  }

  function setSlot(uint256 _slotId, address _signerAddr, bytes32 _tenderAddr) public ifAdmin {
    require(_slotId < epochLength, "out of range slotId");
    Slot storage slot = slots[_slotId];

    // taking empty slot
    if (slot.signer == address(0)) {
      slot.signer = _signerAddr;
      slot.tendermint = _tenderAddr;
      slot.activationEpoch = 0;
      slot.eventCounter++;
      emit ValidatorJoin(
        slot.signer,
        _slotId,
        _tenderAddr,
        slot.eventCounter,
        lastCompleteEpoch + 1
      );
      return;
    }
    // emptying slot
    if (_signerAddr == address(0) && _tenderAddr == 0) {
      slot.activationEpoch = uint32(lastCompleteEpoch + 3);
      slot.eventCounter++;
      emit ValidatorLogout(
        slot.signer,
        _slotId,
        _tenderAddr,
        address(0),
        slot.eventCounter,
        lastCompleteEpoch + 3
      );
      return;
    }
  }

  function activate(uint256 _slotId) public {
    require(_slotId < epochLength, "out of range slotId");
    Slot storage slot = slots[_slotId];
    require(lastCompleteEpoch + 1 >= slot.activationEpoch, "activation epoch not reached yet");
    if (slot.signer != address(0)) {
      emit ValidatorLeave(
        slot.signer,
        _slotId,
        slot.tendermint,
        lastCompleteEpoch + 1
      );
    }
    slot.signer = slot.newSigner;
    slot.tendermint = slot.newTendermint;
    slot.activationEpoch = 0;
    slot.newSigner = address(0);
    slot.newTendermint = 0x0;
    slot.eventCounter++;
    if (slot.signer != address(0)) {
      emit ValidatorJoin(
        slot.signer,
        _slotId,
        slot.tendermint,
        slot.eventCounter,
        lastCompleteEpoch + 1
      );
    }
  }

  function submitPeriod(uint256 _slotId, bytes32 _prevHash, bytes32 _root) public {
    require(_slotId < epochLength, "Incorrect slotId");
    Slot storage slot = slots[_slotId];
    require(slot.signer == msg.sender, "not submitted by signerAddr");
    // This is here so that I can submit in the same epoch I auction/logout but not after
    if (slot.activationEpoch > 0) {
      // if slot not active, prevent submission
      require(lastCompleteEpoch + 2 < slot.activationEpoch, "slot not active");
    }

    uint256 newHeight = bridge.submitPeriod(_prevHash, _root);
    // check if epoch completed
    if (newHeight >= lastEpochBlockHeight + epochLength) {
      lastCompleteEpoch++;
      lastEpochBlockHeight = newHeight;
      emit Epoch(lastCompleteEpoch);
    }
  }

  function submitPeriodForReward(uint256 _slotId, bytes32 _prevHash, bytes32 _blocksRoot) public {
    require(_slotId < epochLength, "Incorrect slotId");
    Slot storage slot = slots[_slotId];
    require(slot.signer == msg.sender, "not submitted by signerAddr");
    // This is here so that I can submit in the same epoch I auction/logout but not after
    if (slot.activationEpoch > 0) {
      // if slot not active, prevent submission
      require(lastCompleteEpoch + 2 < slot.activationEpoch, "slot not active");
    }
    bytes32 periodRood = bytes32(_slotId << 160 | uint160(msg.sender));
    assembly {
      mstore(0, _blocksRoot)
      mstore(0x20, periodRood)
      periodRood := keccak256(0, 0x40)
    }
    uint256 newHeight = bridge.submitPeriod(_prevHash, periodRood);
    // check if epoch completed
    if (newHeight >= lastEpochBlockHeight + epochLength) {
      lastCompleteEpoch++;
      lastEpochBlockHeight = newHeight;
      emit Epoch(lastCompleteEpoch);
    }
  }
}