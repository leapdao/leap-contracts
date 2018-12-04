
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.4.24;

import "openzeppelin-eth/contracts/ownership/Ownable.sol";
import "openzeppelin-eth/contracts/math/SafeMath.sol";
import "zos-lib/contracts/Initializable.sol";
import "./Bridge.sol";

contract POSoperator is Initializable, Ownable {

  using SafeMath for uint256;

  event Epoch(uint256 epoch);

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

  struct PeriodData {
    uint8 slot;
  }

  Bridge public bridge;

  uint256 public epochLength; // length of epoch in periods (32 blocks)
  uint256 public lastCompleteEpoch; // height at which last epoch was completed
  uint256 public lastEpochBlockHeight;

  mapping(uint256 => Slot) public slots;
  mapping(bytes32 => PeriodData) public periodData;

  function initialize (Bridge _bridge, uint256 _epochLength, address _owner) public initializer {
    Ownable.initialize(_owner);
    bridge = _bridge;
    epochLength = _epochLength;
  }

  function setEpochLength(uint256 _epochLength) public onlyOwner {
    epochLength = _epochLength;
  }

  // solium-disable security/no-tx-origin
  // TODO: consider not to use tx.origin
  function bet(
    uint256 _slotId, 
    uint256 _value, 
    address _signerAddr, 
    bytes32 _tenderAddr
  ) public {
    require(_slotId < epochLength);
    Slot storage slot = slots[_slotId];
    // take care of logout
    if (_value == 0 && slot.newStake == 0 && slot.signer == _signerAddr) {
      require(slot.owner == tx.origin);
      slot.activationEpoch = uint32(lastCompleteEpoch.add(3));
      slot.eventCounter++;
      emit ValidatorLogout(
        slot.signer, 
        _slotId, 
        _tenderAddr,
        0x0, 
        slot.eventCounter, 
        lastCompleteEpoch + 3
      );
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
    if (slot.stake == 0 || (slot.owner == tx.origin && slot.newStake == 0)) {
      uint64 stake = slot.stake;
      ERC20(bridge.nativeToken()).transferFrom(tx.origin, this, _value - slot.stake);
      slot.owner = tx.origin;
      slot.signer = _signerAddr;
      slot.tendermint = _tenderAddr;
      slot.stake = uint64(_value);
      slot.activationEpoch = 0;
      slot.eventCounter++;
      if (stake == 0) {
        emit ValidatorJoin(
          slot.signer, 
          _slotId, 
          _tenderAddr, 
          slot.eventCounter, 
          lastCompleteEpoch + 1
        );
      } else {
        emit ValidatorUpdate(
          slot.signer, 
          _slotId, 
          _tenderAddr, 
          slot.eventCounter
        );
      }
    } else { // auction
      if (slot.newStake > 0) {
        ERC20(bridge.nativeToken()).transfer(slot.newOwner, slot.newStake);
      }
      ERC20(bridge.nativeToken()).transferFrom(tx.origin, this, _value);
      slot.newOwner = tx.origin;
      slot.newSigner = _signerAddr;
      slot.newTendermint = _tenderAddr;
      slot.newStake = uint64(_value);
      slot.activationEpoch = uint32(lastCompleteEpoch.add(3));
      slot.eventCounter++;
      emit ValidatorLogout(
        slot.signer, 
        _slotId, 
        _tenderAddr, 
        _signerAddr, 
        slot.eventCounter, 
        lastCompleteEpoch + 3
      );
    }
  }
  // solium-enable security/no-tx-origin

  function activate(uint256 _slotId) public {
    require(_slotId < epochLength);
    Slot storage slot = slots[_slotId];
    require(lastCompleteEpoch + 1 >= slot.activationEpoch);
    if (slot.stake > 0) {
      ERC20(bridge.nativeToken()).transfer(slot.owner, slot.stake);
      emit ValidatorLeave(
        slot.signer, 
        _slotId, 
        slot.tendermint, 
        lastCompleteEpoch + 1
      );
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
    require(slot.signer == msg.sender);
    // This is here so that I can submit in the same epoch I auction/logout but not after
    if (slot.activationEpoch > 0) {
      // if slot not active, prevent submission
      require(lastCompleteEpoch.add(2) < slot.activationEpoch);
    }

    (uint256 newHeight, uint256 reward) = bridge.submitPeriod(_prevHash, _root);
    // check if epoch completed
    if (newHeight >= lastEpochBlockHeight.add(epochLength)) {
      lastCompleteEpoch++;
      lastEpochBlockHeight = newHeight;
      emit Epoch(lastCompleteEpoch);
    }

    slot.stake += uint64(reward);
  }
}