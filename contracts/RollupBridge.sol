
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
    newHeight = submitPeriod(_prevHash, _root);

    uint256 blockDataSize = 0;
    // <4b function sig, 32b prevHash, 32b root, 32b garbage, 32b _blockData length, ...._blockData>
    assembly {
      // _blockData.length
      blockDataSize := calldataload(100)
      let memPtr := mload(64)
      calldatacopy(memPtr, 132, blockDataSize)
      let blockHash := keccak256(memPtr, blockDataSize)
      let key := 1234
      sstore(key, blockHash)
    }
    require(blockDataSize < 32000, "exceeded max tx size");
  }

}
