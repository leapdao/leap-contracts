
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */
 
pragma solidity ^0.5.2;

contract IERC1948 {
  
  event DataUpdated(uint256 indexed tokenId, bytes32 oldData, bytes32 newData);

  function readData(uint256 _tokenId) public view returns (bytes32);

  function writeData(uint256 _tokenId, bytes32 _newData) public;

}