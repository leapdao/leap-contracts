
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

import "../Adminable.sol";

contract OperatorMock is Adminable {
  uint256 public minGasPrice;
  uint256 public epochLength;
  uint256 public parentBlockInterval;
  uint256 public slotId;

  function setMinGasPrice(uint256 _minGasPrice) public ifAdmin {
    minGasPrice = _minGasPrice;
  }

  function setEpochLength(uint256 _epochLength) public ifAdmin {
    epochLength = _epochLength;
  }

  function setParentBlockInterval(uint256 _parentBlockInterval) public ifAdmin {
    parentBlockInterval = _parentBlockInterval;
  }

  function setSlot(uint256 _slotId, address, bytes32) public ifAdmin {
    slotId = _slotId;
  }

}