/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */
pragma solidity 0.5.2;

/**
 * @title IDelayedBreeder
 * @dev Interface for delayed breeding
 */

contract IDelayedBreeder {

  function breed(uint256 _queenId, uint256 _workerId, address _to) public;

}

