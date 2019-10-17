/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */
pragma solidity 0.5.2;


import "../../node_modules/openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";

contract QuadraticMeetings {

  event Pledged(
    address indexed from,
    address indexed to,
    uint256 amount
  );

  struct Pledge {
    uint256 plainAmount;
    uint256 constrainAmount;
  }

  uint256 constant SUB_FAC = 10000;
  uint256 constant MIN_INCOME = 50000000000000000000;
  address public daiAddr;
  address public secretary;
  address public facilitator;
  address public funder;
  uint256 public subsidy; // between 0 and SUB_FAC
  mapping(address => Pledge) public pledges;

  constructor(
    address _daiAddr,
    address _secretary,
    address _facilitator,
    address _funder,
    uint256 _subsidyFactor
  ) public {
    daiAddr = _daiAddr;
    secretary = _secretary;
    facilitator = _facilitator;
    funder = _funder;
    require(_subsidyFactor <= SUB_FAC, "subsidy can not be higher 1");
    subsidy = _subsidyFactor;
    _pledge(secretary, MIN_INCOME);
    _pledge(facilitator, MIN_INCOME);
  }

  // see https://github.com/ethereum/dapp-bin/pull/50/files
  function _sqrt(uint256 x) internal pure returns (uint256 y) {
    if (x == 0) return 0;
    else if (x <= 3) return 1;
    uint z = (x + 1) / 2;
    y = x;
    while (z < y) {
      y = z;
      z = (x / z + z) / 2;
    }
  }

  function _max(uint256 a, uint256 b) internal pure returns (uint256) {
    return a >= b ? a : b;
  }

  function _pledge(address _to, uint256 _amount) internal {
    Pledge storage pledge = pledges[_to];
    pledge.plainAmount += _sqrt(_amount);
    pledge.constrainAmount += _amount;
    emit Pledged(msg.sender, _to, _amount);
  }

  function pledge(address _to, uint256 _amount) public {
    // todo: check identity (or reputation)
    // todo: prevent self-funding
    IERC20 dai = IERC20(daiAddr);
    dai.transferFrom(msg.sender, address(this), _amount);
    _pledge(_to, _amount);
  }

  function payout() public {
    IERC20 dai = IERC20(daiAddr);

    Pledge memory pledge = pledges[msg.sender];
    uint256 payout = (pledge.plainAmount * pledge.plainAmount * subsidy / SUB_FAC) -
      (subsidy * pledge.constrainAmount / SUB_FAC);

    uint256 bal = dai.balanceOf(address(this));
    if (bal > 0) {
      dai.transfer(msg.sender, _max(bal, payout));
      if (bal < payout) {
        bal = payout - bal;
      }
    } else {
      bal = payout;
    }
    if (bal > 0) {
      dai.transferFrom(funder, msg.sender, bal);
    }
  }
}