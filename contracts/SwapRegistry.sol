
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.4.24;

import "./Bridge.sol";
import "./Adminable.sol";
import "./SwapExchange.sol";

contract SwapRegistry is Adminable {

  // Swap related
  event NewExchange(address indexed token, address indexed exchange);
  uint256 public tokenCount;
  mapping(address => address) tokenToExchange;
  mapping(address => address) exchangeToToken;
  mapping(uint256 => address) idToToken;

  // Claim Related
  Bridge bridge;
  uint256 public taxRate; // as permill (1000 == 100%, 1 == 0.1%)
  uint256 public inflationCap;
  mapping(uint256 => uint256) slotToHeight;

  function initialize(address _bridge, address _nativeToken) public initializer {
    require(_bridge != 0, "invalid bridge address");
    bridge = Bridge(_bridge);
    require(_nativeToken != 0, "invalid token address");
    // todo: check that this contract is admin of token;
    idToToken[1] = _nativeToken;
    tokenCount = 1;
  }

  function claim(uint256 _slotId, bytes32[] memory _roots) public {
    uint256 maxHeight = slotToHeight[_slotId];
    uint256 claimCount = 0;
    for (uint256 i = 0; i < _roots.length; i+= 2) {
      require(_slotId == uint256(_roots[i+1]), "unexpected slotId");
      uint256 height;
      (,height ,,) = bridge.periods(keccak256(_roots[i], _roots[i + 1]));
      require(height > maxHeight, "unorderly claim");
      maxHeight = height;
      claimCount += 1;
    }
    slotToHeight[_slotId] = maxHeight;
    // calculate token amount
    // mint tokens
    // transfer tokens
  }

  function createExchange(address _token) public returns (address) {
    require(_token != 0, "invalid token address");
    require(tokenToExchange[_token] == 0, "exchange already created");
    // todo: deploy exchange
    address exchange = address(new SwapExchange());
    // Exchange(exchange).setup(token)
    tokenToExchange[_token] = exchange;
    exchangeToToken[exchange] = _token;
    tokenCount += 1;
    idToToken[tokenCount] = _token;
    emit NewExchange(_token, exchange);
    return exchange;
  }

  function getExchange(address _token) public view returns(address) {
    return tokenToExchange[_token];
  }

  function getToken(address _exchange) public view returns(address) {
    return exchangeToToken[_exchange];
  }

  function getTokenWithId(uint256 _tokenId) public view returns(address) {
    return idToToken[_tokenId];
  }

}