
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

import "../../node_modules/openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "../misc/BountyPayout.sol";

contract SafeMock {

  IERC20 dai;
  BountyPayout bp;

  constructor(address daiAddr, address bpAddr) public {
    dai = IERC20(daiAddr);
    bp = BountyPayout(bpAddr);
  }

  function approve(address addr, uint256 amount) public {
    dai.approve(addr, amount);
  }

  function () external payable {

  }

  function payout(
    bytes32 _gardener,
    bytes32 _worker,
    bytes32 _reviewer,
    bytes32 _bountyId
  ) public {
    return bp.payout.value(address(this).balance)(_gardener, _worker, _reviewer, _bountyId);
  }

}