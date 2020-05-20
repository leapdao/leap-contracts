
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity ^0.5.12;

import "../PoaOperator.sol";

contract PoaOperatorMock is PoaOperator {

  function setLastCompleteEpochForTest(uint256 _lastCompleteEpoch) public {
    lastCompleteEpoch = _lastCompleteEpoch;
  }

  function setActiveSlotsMap(uint256 _activeSlots) public {
    takenSlots = _activeSlots;
  }

}