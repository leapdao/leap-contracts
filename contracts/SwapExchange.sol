
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

contract SwapExchange {

  address factory;
  address token;
  address nativeToken;
  bytes32 public name;
  bytes32 public symbol;
  uint256 public decimals;

  function setup(address _nativeToken, address _tokenAddr) public {
    require(factory == address(0) && token == address(0), "setup can only be executed once");
    require(_nativeToken != address(0), "tokenAddr not valid");
    require(_tokenAddr != address(0), "tokenAddr not valid");
    factory = msg.sender;
    token = _tokenAddr;
    nativeToken = _nativeToken;
    name = 0x4c65617020537761702056310000000000000000000000000000000000000000;   // Leap Swap V1
    symbol = 0x4c4541502d563100000000000000000000000000000000000000000000000000; // LEAP-V1
    decimals = 18;
  }

  // to be implemented

}