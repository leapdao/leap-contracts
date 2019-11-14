
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

import "./AdminableProxy.sol";
import "../PosOperator.sol";

/**
 * @title OperatorProxy
 * @dev Proxy for PosOperator/PoaOperator contract upgradeability. Should be used to
 * communicate with PosOperator/PoaOperator contract
 */
contract OperatorProxy is AdminableProxy {

  constructor(
    PosOperator _implementation,
    bytes memory _data
  ) AdminableProxy(address(_implementation), _data) public payable {
  }

}