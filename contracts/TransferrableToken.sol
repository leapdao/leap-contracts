
/**
 * Copyright (c) 2017-present, Parsec Labs (parseclabs.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/introspection/ERC165.sol";

contract TransferrableToken is ERC165 {
  function transferFrom(address _from, address _to, uint256 _valueOrTokenId) public;
}