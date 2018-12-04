
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.4.24;

import "openzeppelin-eth/contracts/ownership/Ownable.sol";
import "zos-lib/contracts/Initializable.sol";

import "./PriorityQueue.sol";
import "./TransferrableToken.sol";
import "./IntrospectionUtil.sol";
import "./Bridge.sol";

contract Vault is Initializable, Ownable {

  event NewToken(address indexed tokenAddr, uint16 color);

  Bridge public bridge;

  uint16 public erc20TokenCount;
  uint16 public nftTokenCount;

  mapping(uint16 => PriorityQueue.Token) public tokens;
  mapping(address => bool) public tokenColors;

  function initialize (Bridge _bridge, address _owner) public initializer {
    Ownable.initialize(_owner);
    erc20TokenCount = 0;
    nftTokenCount = 0;
    bridge = _bridge;
    registerToken(TransferrableToken(bridge.nativeToken()), false);
  } 

  function registerToken(TransferrableToken _token, bool _isERC721) public onlyOwner {
    // make sure token is not 0x0 and that it has not been registered yet
    require(_token != address(0), "Tried to register 0x0 address");
    require(!tokenColors[_token], "Token already registered");
    uint16 color;
    if (_isERC721) {
      require(_token.supportsInterface(0x80ac58cd) == true, "Not an ERC721 token");
      color = 32769 + nftTokenCount; // NFT color namespace starts from 2^15 + 1
      nftTokenCount += 1;
    } else {
      require(ERC20(_token).totalSupply() >= 0, "Not an ERC20 token");
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