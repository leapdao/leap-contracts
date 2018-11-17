
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.4.24;

import "./DepositHandler.sol";
import "./Bridge.sol";

contract ExitHanlder is DepositHandler {

  constructor(Bridge _bridge) DepositHandler(_bridge) public {

  }

}