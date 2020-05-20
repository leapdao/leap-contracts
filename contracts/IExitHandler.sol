
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

/* solium-disable security/no-block-members */

pragma solidity ^0.5.12;

contract IExitHandler {

  function startExit(bytes32[] memory, bytes32[] memory, uint8, uint8) public payable;

}
