
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.4.24;

import "./Bridge.sol";
import "./Vault.sol";
import "./Adminable.sol";
import "./SwapExchange.sol";
import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";
import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";

contract SwapRegistry is Adminable {
  using SafeMath for uint256;

  // Claim Related
  Bridge bridge;
  Vault vault;
  uint256 constant maxTax = 1000;
  uint256 taxRate; // as perMil (1000 == 100%, 1 == 0.1%)
  uint256 public lastYearTotalSupply;
  uint256 periodsClaimed; // a counter between 0 and periodsPerYear
  uint256 periodsPerYear;
  uint256 inflationCap; // as totalSupply / x (2 = 50%, 10 = 10%)
  mapping(uint256 => uint256) slotToHeight;

  function initialize(
    address _bridge,
    address _vault,
    uint32 _taxRate,
    uint32 _periodsPerYear,
    uint256 _initialTotalSupply
  ) public initializer {
    require(_bridge != 0, "invalid bridge address");
    bridge = Bridge(_bridge);
    require(_bridge != 0, "invalid vault address");
    vault = Vault(_vault);
    // todo: check that this contract is admin of token;
    require(_taxRate <= maxTax, "tax rate can not be more than 100%");
    taxRate = _taxRate;
    periodsPerYear = _periodsPerYear;
    inflationCap = 2;
    periodsClaimed = 0;
    lastYearTotalSupply = _initialTotalSupply;
  }

  function claim(uint256 _slotId, bytes32[] memory _roots) public {
    uint256 maxHeight = slotToHeight[_slotId];
    uint32 claimCount = 0;
    for (uint256 i = 0; i < _roots.length; i += 2) {
      require(_slotId == uint256(_roots[i+1] >> 160), "unexpected slotId");
      require(msg.sender == address(_roots[i+1]), "unexpected claimant");
      uint256 height;
      (,height ,,) = bridge.periods(keccak256(_roots[i], _roots[i + 1]));
      require(height > maxHeight, "unorderly claim");
      maxHeight = height;
      claimCount += 1;
    }
    slotToHeight[_slotId] = maxHeight;
    ERC20Mintable token = ERC20Mintable(vault.getTokenAddr(0));
    uint256 total = token.totalSupply();
    uint256 staked = token.balanceOf(bridge.operator());
    
    // update lastYearTotalSupply if year passed
    periodsClaimed = claimCount + periodsClaimed;
    if (periodsClaimed > periodsPerYear) {
      periodsClaimed = periodsClaimed % periodsPerYear;
      lastYearTotalSupply = total;
    }
    // calculate reward according to:
    // https://ethresear.ch/t/riss-reflexive-inflation-through-staked-supply/3633
    uint256 reward;
    if (staked <= total.div(2)) {
      //             total
      //  --------------------------
      //  inflation * periodsPerYear
      reward = lastYearTotalSupply.div(inflationCap).div(periodsPerYear);
    } else {
      if (lastYearTotalSupply < total) {
        // adjust stake proportial to last years supply
        staked = staked.mul(lastYearTotalSupply).div(total);
      }
      //    4 * staked * (total - staked)
      //  ----------------------------------
      //  total * inflation * periodsPerYear
      reward = lastYearTotalSupply.sub(staked).mul(staked).mul(4).div(lastYearTotalSupply).div(inflationCap).div(periodsPerYear);
    }
    reward = reward.mul(claimCount);
    uint256 tax = reward.mul(taxRate).div(maxTax);  // taxRate perMil (1000 == 100%, 1 == 0.1%)
    // mint tokens
    token.mint(msg.sender, reward.sub(tax));
    token.mint(bridge.admin(), tax);
  }

  // Governance Params

  function getPeriodsPerYear() public view returns(uint256) {
    return periodsPerYear;
  }

  function setPeriodsPerYear(uint256 _periodsPerYear) public ifAdmin {
    periodsPerYear = _periodsPerYear;
  }

  function getTaxRate() public view returns(uint256) {
    return taxRate;
  }

  function setTaxRate(uint256 _taxRate) public ifAdmin {
    require(_taxRate <= maxTax, "tax rate can not be more than 100%");
    taxRate = _taxRate;
  }

  function getInflationCap() public view returns(uint256) {
    return inflationCap;
  }

  function setInflationCap(uint256 _inflationCap) public ifAdmin {
    require(_inflationCap > 0, "inflation cap can not be 0");
    inflationCap = _inflationCap;
  }

  // Swap Exchanges

  event NewExchange(address indexed token, address indexed exchange);
  mapping(address => address) tokenToExchange;
  mapping(address => address) exchangeToToken;

  function createExchange(address _token) public returns (address) {
    require(_token != 0, "invalid token address");
    require(tokenToExchange[_token] == 0, "exchange already created");
    // todo: deploy exchange
    address exchange = address(new SwapExchange());
    // Exchange(exchange).setup(token)
    tokenToExchange[_token] = exchange;
    exchangeToToken[exchange] = _token;
    emit NewExchange(_token, exchange);
    return exchange;
  }

  function getExchange(address _token) public view returns(address) {
    return tokenToExchange[_token];
  }

  function getToken(address _exchange) public view returns(address) {
    return exchangeToToken[_exchange];
  }

}