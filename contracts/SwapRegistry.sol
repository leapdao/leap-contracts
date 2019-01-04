
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
import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";
import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";

contract SwapRegistry is Adminable {
  using SafeMath for uint256;

  // Swap related
  event NewExchange(address indexed token, address indexed exchange);
  uint256 public tokenCount;
  mapping(address => address) tokenToExchange;
  mapping(address => address) exchangeToToken;
  mapping(uint256 => address) idToToken;

  // Claim Related
  Bridge bridge;
  uint256 taxRate; // as perMil (1000 == 100%, 1 == 0.1%)
  uint256 claimsPerYear;
  uint256 inflationCap; // in perMil (500 = 50% inflation per year)
  mapping(uint256 => uint256) slotToHeight;

  function initialize(address _bridge, address _nativeToken, uint256 _taxRate, uint256 _claimsPerYear) public initializer {
    require(_bridge != 0, "invalid bridge address");
    bridge = Bridge(_bridge);
    require(_nativeToken != 0, "invalid token address");
    // todo: check that this contract is admin of token;
    idToToken[0] = _nativeToken;
    tokenCount = 0;
    taxRate = _taxRate;
    claimsPerYear = _claimsPerYear;
    inflationCap = 500;
  }

  function claim(uint256 _slotId, bytes32[] memory _roots) public {
    uint256 maxHeight = slotToHeight[_slotId];
    uint256 claimCount = 0;
    for (uint256 i = 0; i < _roots.length; i+= 2) {
      require(_slotId == uint256(_roots[i+1] >> 160), "unexpected slotId");
      require(msg.sender == address(_roots[i+1]), "unexpected claimant");
      uint256 height;
      (,height ,,) = bridge.periods(keccak256(_roots[i], _roots[i + 1]));
      require(height > maxHeight, "unorderly claim");
      maxHeight = height;
      claimCount += 1;
    }
    slotToHeight[_slotId] = maxHeight;
    // calculate token amount
    // according to https://ethresear.ch/t/riss-reflexive-inflation-through-staked-supply/3633
    ERC20Mintable token = ERC20Mintable(idToToken[0]);
    uint256 staked = token.balanceOf(bridge.operator());
    uint256 total = token.totalSupply();
    uint256 reward;
    if (staked < total.div(2)) {
      reward = total.mul(inflationCap).div(1000).div(claimsPerYear);
    } else {
      reward = staked.mul(total).mul(2).sub(staked.mul(staked).mul(2)).div(total).div(claimsPerYear);
    }
    reward = reward.mul(claimCount);
    total = reward;
    reward = reward.mul(taxRate).div(1000);
    // mint tokens
    token.mint(msg.sender, reward);
    token.mint(bridge.admin(), total.sub(reward));
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

  function getClaimsPerYear() public view returns(uint256) {
    return claimsPerYear;
  }

  function getTaxRate() public view returns(uint256) {
    return taxRate;
  }

}