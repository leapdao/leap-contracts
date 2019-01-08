
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

//import "zos-lib/contracts/upgradeability/AdminUpgradeabilityProxy.sol"; - should be changed back once zos-lib will update import
import "../zos/AdminUpgradeabilityProxy.sol";

/**
 * @title AdminUpgradeabilityProxy
 * @dev This contract combines an upgradeability proxy with an authorization
 * mechanism for administrative tasks.
 * All external functions in this contract must be guarded by the
 * `ifAdmin` modifier. See ethereum/solidity#3864 for a Solidity
 * feature proposal that would enable this to be done automatically.
 */
contract AdminableProxy is AdminUpgradeabilityProxy {

  /**
   * Contract constructor.
   */
  constructor(address _implementation, bytes memory _data) 
  AdminUpgradeabilityProxy(_implementation, _data) public payable {
  }

  /**
   * @dev apply proposal.
   */
  function applyProposal(bytes calldata data) external ifAdmin returns (bool) {
    bool rv;
    (rv, ) = _implementation().delegatecall(data);
    return rv;
  }

}