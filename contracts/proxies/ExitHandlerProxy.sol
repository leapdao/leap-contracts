
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.4.24;

import "./AdminableProxy.sol";
import "../ExitHandler.sol";

/**
 * @title ExitHandlerProxy
 * @dev Proxy for ExitHandler contract upgradeability. Should be used to 
 * communicate with ExitHandler contract
 */
contract ExitHandlerProxy is AdminableProxy {

  constructor(ExitHandler _implementation, bytes _data) 
    AdminableProxy(_implementation, _data) public payable {
  }

}