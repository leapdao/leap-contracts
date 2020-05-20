
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity ^0.5.12;

import "./Bridge.sol";

contract RollupBridge is Bridge {

  function submitPeriodWithData(
    bytes32 _prevHash,
    bytes32 _root,
    bytes calldata _blockData)
  external onlyOperator returns (uint256 newHeight) {
    return submitPeriod(_prevHash, _root);
  }

}
