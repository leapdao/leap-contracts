
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

import "./Bridge.sol";
import "./Adminable.sol";
import "./PriorityQueue.sol";
import "./TransferrableToken.sol";

contract Vault is Adminable {

  event NewToken(address indexed tokenAddr, uint16 color);

  Bridge public bridge;

  uint16 public erc20TokenCount;
  uint16 public nftTokenCount;

  mapping(uint16 => PriorityQueue.Token) public tokens;
  mapping(address => bool) public tokenColors;

  function initialize(Bridge _bridge) public initializer {
    bridge = _bridge;
  } 

  function getTokenAddr(uint16 _color) public view returns (address) {
    return address(tokens[_color].addr);
  }

  function registerToken(address _token, bool _isERC721) public ifAdmin {
    // make sure token is not 0x0 and that it has not been registered yet
    require(_token != address(0), "Tried to register 0x0 address");
    require(!tokenColors[_token], "Token already registered");
    uint16 color;
    if (_isERC721) {
      require(TransferrableToken(_token).supportsInterface(0x80ac58cd) == true, "Not an ERC721 token");
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
      addr: TransferrableToken(_token),
      heapList: arr,
      currentSize: 0
    });
    emit NewToken(_token, color);
  }

  // solium-disable-next-line mixedcase
  uint256[50] private ______gap;

}