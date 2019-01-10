
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

import "../Bridge.sol";

contract BridgeUpgradeTest is Bridge {

  event LogMessage(string msg);

  function setOperator(address _operator) public ifAdmin {
    operator = _operator;
    emit NewOperator(_operator);
    emit LogMessage("This is upgraded Bridge contract");
  }

  function submitPeriod2(bytes32 _prevHash, bytes32 _root) public returns (uint256 newHeight) {
    emit LogMessage("This is upgraded Bridge contract");
    return submitPeriod(_prevHash, _root);
  }

  function isUpgraded() public pure returns (bool) {
    return true;
  }

}