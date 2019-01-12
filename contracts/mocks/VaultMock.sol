
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

import "../Adminable.sol";

contract VaultMock is Adminable {
  uint256 public exitStake;
  uint256 public tokenCount;

  function setExitStake(uint256 _exitStake) public ifAdmin {
    exitStake = _exitStake;
  }

  function registerToken(address) public ifAdmin {
    tokenCount++;
  }
}