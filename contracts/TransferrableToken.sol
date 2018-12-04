
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.4.24;

import "openzeppelin-eth/contracts/introspection/IERC165.sol";


contract TransferrableToken is IERC165 {
  function transferFrom(address _from, address _to, uint256 _valueOrTokenId) public;
  function approve(address _to, uint256 _value) public;
}