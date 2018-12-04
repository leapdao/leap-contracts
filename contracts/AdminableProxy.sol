
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity ^0.4.24;

import "zos-lib/contracts/upgradeability/AdminUpgradeabilityProxy.sol";

/**
 * @title AdminableProxy
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
  constructor(address _implementation, bytes _data) AdminUpgradeabilityProxy(_implementation, _data) public payable {
  }

  /**
   * @dev fallback implementation.
   * Extracted to enable manual triggering.
   */
  function _fallback() internal {
  	// TODO: find a way to prevent backdooring according to
  	// https://medium.com/nomic-labs-blog/malicious-backdoors-in-ethereum-proxies-62629adf3357
  	// _willFallback();
    _delegate(_implementation());
  }

}