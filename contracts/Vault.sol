
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
import "./IERC1948.sol";

contract Vault is Adminable {
  using PriorityQueue for PriorityQueue.Token;

  // 2**15 + 1
  uint16 constant NFT_FIRST_COLOR = 32769;
  // 2**15 + 2**14 + 1
  uint16 constant NST_FIRST_COLOR = 49153;

  event NewToken(address indexed tokenAddr, uint16 color);

  Bridge public bridge;

  uint16 public erc20TokenCount;
  uint16 public nftTokenCount;
  uint16 public nstTokenCount;

  mapping(uint16 => PriorityQueue.Token) public tokens;
  mapping(address => bool) public tokenColors;

  function initialize(Bridge _bridge) public initializer {
    bridge = _bridge;
  }

  function getTokenAddr(uint16 _color) public view returns (address) {
    return address(tokens[_color].addr);
  }

  // token types: 0 = ERC20, 1 = ERC721, 2 = ERC1948
  function registerToken(address _token, uint256 _type) public ifAdmin {
    // make sure token is not 0x0 and that it has not been registered yet
    require(_token != address(0), "Tried to register 0x0 address");
    require(!tokenColors[_token], "Token already registered");
    uint16 color;
    if (_type == 0) {
      require(ERC20(_token).totalSupply() >= 0, "Not an ERC20 token");
      color = erc20TokenCount;
      erc20TokenCount += 1;
    } else if (_type == 1) {
      // max nft count without being an NST is 16384
      // color must be < 49153
      require(nftTokenCount < 0x4000);
      require(TransferrableToken(_token).supportsInterface(0x80ac58cd) == true, "Not an ERC721 token");
      color = NFT_FIRST_COLOR + nftTokenCount; // NFT color namespace starts from 2^15 + 1
      nftTokenCount += 1;
    } else {
      require(nstTokenCount < 0x3ffe);
      require(TransferrableToken(_token).supportsInterface(0x80ac58cd) == true, "Not an ERC721 token");
      color = NST_FIRST_COLOR + nstTokenCount; // NST color namespace starts from 2^15 + 2^14 + 1
      nstTokenCount += 1;
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
  uint256[49] private ______gap;

}
