
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

import "./PriorityQueue.sol";
import "./TransferrableToken.sol";
import "./IntrospectionUtil.sol";
import "./Bridge.sol";

contract Vault is Ownable {

  event NewToken(address indexed tokenAddr, uint16 color);

  Bridge bridge;

  uint16 public erc20TokenCount = 0;
  uint16 public nftTokenCount = 0;

  mapping(uint16 => PriorityQueue.Token) public tokens;
  mapping(address => bool) public tokenColors;

  constructor (Bridge _bridge) public {
    bridge = _bridge;
    registerToken(TransferrableToken(bridge.nativeToken()));
  } 

  function registerToken(TransferrableToken _token) public onlyOwner {
    // make sure token is not 0x0 and that it has not been registered yet
    require(_token != address(0), "Tried to register 0x0 address");
    require(!tokenColors[_token], "Token already registered");
    uint16 color;
    if (IntrospectionUtil.isERC721(_token)) {
      color = 32769 + nftTokenCount; // NFT color namespace starts from 2^15 + 1
      nftTokenCount += 1;
    } else {
      color = erc20TokenCount;
      erc20TokenCount += 1;
    }
    uint256[] memory arr = new uint256[](1);
    tokenColors[_token] = true;
    tokens[color] = PriorityQueue.Token({
      addr: _token,
      heapList: arr,
      currentSize: 0
    });
    emit NewToken(_token, color);
  }

}