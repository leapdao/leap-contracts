
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

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
  uint256 constant maxTax = 1000; // 100%
  uint256 taxRate; // as perMil (1000 == 100%, 1 == 0.1%)
  uint256 constant inflationFactor = 10 ** 15;
  uint256 constant maxInflation = 2637549827; // the x from (1 + x*10^-18)^(30 * 24 * 363) = 2  
  uint256 inflationRate; // between 0 and maxInflation/inflationFactor
  uint256 constant poaSupplyTarget = 7000000 * 10 ** 18;
  uint256 poaReward;
  mapping(uint256 => uint256) slotToHeight;

  function initialize(
    address _bridge,
    address _vault,
    uint256 _poaReward
  ) public initializer {
    require(_bridge != address(0), "invalid bridge address");
    bridge = Bridge(_bridge);
    require(_bridge != address(0), "invalid vault address");
    vault = Vault(_vault);
    // todo: check that this contract is admin of token;
    taxRate = maxTax;
    inflationRate = maxInflation;
    poaReward = _poaReward;
  }

  function claim(uint256 _slotId, bytes32[] memory _roots) public {
    uint256 maxHeight = slotToHeight[_slotId];
    uint32 claimCount = 0;
    for (uint256 i = 0; i < _roots.length; i += 2) {
      require(_slotId == uint256(_roots[i+1] >> 160), "unexpected slotId");
      require(msg.sender == address(uint160(uint256(_roots[i+1]))), "unexpected claimant");
      uint256 height;
      (,height ,,) = bridge.periods(keccak256(abi.encodePacked(_roots[i], _roots[i + 1])));
      require(height > maxHeight, "unorderly claim");
      maxHeight = height;
      claimCount += 1;
    }
    slotToHeight[_slotId] = maxHeight;
    ERC20Mintable token = ERC20Mintable(vault.getTokenAddr(0));
    uint256 total = token.totalSupply();
    uint256 staked = token.balanceOf(bridge.operator());
    
    // calculate reward according to:
    // https://ethresear.ch/t/riss-reflexive-inflation-through-staked-supply/3633
    uint256 reward = total.mul(inflationRate).div(inflationFactor);
    if (staked > total.div(2)) {
      reward = reward.mul(total.sub(staked).mul(staked).mul(4)).div(total);
    }
    if (total < poaSupplyTarget) {
      reward = poaReward;
    }
    reward = reward.mul(claimCount);
    uint256 tax = reward.mul(taxRate).div(maxTax);  // taxRate perMil (1000 == 100%, 1 == 0.1%)
    // mint tokens
    token.mint(msg.sender, reward.sub(tax));
    token.mint(bridge.admin(), tax);
  }

  // Governance Params

  function getTaxRate() public view returns(uint256) {
    return taxRate;
  }

  function setTaxRate(uint256 _taxRate) public ifAdmin {
    require(_taxRate <= maxTax, "tax rate can not be more than 100%");
    taxRate = _taxRate;
  }

  function getInflationRate() public view returns(uint256) {
    return inflationRate;
  }

  function setInflationRate(uint256 _inflationRate) public ifAdmin {
    require(_inflationRate < maxInflation, "inflation too high");
    inflationRate = _inflationRate;
  }

  // Swap Exchanges

  event NewExchange(address indexed token, address indexed exchange);
  mapping(address => address) tokenToExchange;
  mapping(address => address) exchangeToToken;
  address exchangeCodeAddr;

  function createExchange(address _token) public returns (address) {
    require(_token != address(0), "invalid token address");
    address nativeToken = vault.getTokenAddr(0);
    require(_token != nativeToken, "token can not be nativeToken");
    require(tokenToExchange[_token] == address(0), "exchange already created");
    address exchange = createClone(exchangeCodeAddr);
    SwapExchange(exchange).setup(nativeToken, _token);
    tokenToExchange[_token] = exchange;
    exchangeToToken[exchange] = _token;
    emit NewExchange(_token, exchange);
    return exchange;
  }

  function getExchangeCodeAddr() public view returns(address) {
    return exchangeCodeAddr;
  }

  function setExchangeCodeAddr(address _exchangeCodeAddr) public ifAdmin {
    exchangeCodeAddr = _exchangeCodeAddr;
  }

  function getExchange(address _token) public view returns(address) {
    return tokenToExchange[_token];
  }

  function getToken(address _exchange) public view returns(address) {
    return exchangeToToken[_exchange];
  }

  function createClone(address target) internal returns (address result) {
    bytes20 targetBytes = bytes20(target);
    assembly {
      let clone := mload(0x40)
      mstore(clone, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
      mstore(add(clone, 0x14), targetBytes)
      mstore(add(clone, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
      result := create(0, clone, 0x37)
    }
  }

}