
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./PoaOperator.sol";

contract PosOperator is PoaOperator {
  using SafeMath for uint256;

  // solium-disable security/no-tx-origin
  // TODO: consider not to use tx.origin
  function bet(
    uint256 _slotId,
    uint256 _value,
    address _signerAddr,
    bytes32 _tenderAddr
  ) public {
    require(_slotId < epochLength, "slot not available");
    Slot storage slot = slots[_slotId];
    // take care of logout
    if (_value == 0 && slot.newStake == 0 && slot.signer == _signerAddr) {
      require(slot.owner == tx.origin, "only owner can logout");
      slot.activationEpoch = uint32(lastCompleteEpoch.add(3));
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
    // check min stake
    uint required = slot.stake;
    if (slot.newStake > required) {
      required = slot.newStake;
    }
    required = required.mul(105).div(100);
    require(required < _value, "bet too low");

    // new purchase or update
    if (slot.stake == 0 || (slot.owner == tx.origin && slot.newStake == 0)) {
      uint64 stake = slot.stake;
      ERC20(vault.getTokenAddr(0)).transferFrom(tx.origin, address(this), _value - slot.stake);
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
        ERC20(vault.getTokenAddr(0)).transfer(slot.newOwner, slot.newStake);
      }
      ERC20(vault.getTokenAddr(0)).transferFrom(tx.origin, address(this), _value);
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
    require(_slotId < epochLength, "slot not available");
    Slot storage slot = slots[_slotId];
    require(lastCompleteEpoch + 1 >= slot.activationEpoch, "activation epoch not reached yet");
    if (slot.stake > 0) {
      ERC20(vault.getTokenAddr(0)).transfer(slot.owner, slot.stake);
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
    slot.newOwner = address(0);
    slot.newSigner = address(0);
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
}