/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

import "./IColony.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

contract BountyPayout {

  address public payerAddr;
  address public colonyAddr;
  address public daiAddr;
  address public leapAddr;

  enum PayoutType { Gardener, Worker, Reviewer }
  event Payout(
    bytes32 indexed bountyId,
    PayoutType indexed payoutType,
    address indexed recipient,
    uint256 amount,
    uint256 paymentId
  );

  constructor(
    address _payerAddr,
    address _colonyAddr,
    address _daiAddr,
    address _leapAddr) public {
    payerAddr = _payerAddr;
    colonyAddr = _colonyAddr;
    daiAddr = _daiAddr;
    leapAddr = _leapAddr;
  }

  modifier onlyPayer() {
    require(msg.sender == payerAddr, "Only payer can call");
    _;
  }

 /**
  * Transfers given token to multiple recipients as specified by _recepients and _splits arrays
  *
  * @dev This contract should have enough allowance of _tokenAddr from _payerAddr
  * @param _gardenerAddr gardener wallet address
  */
  function payout(
    address payable _gardenerAddr,
    uint256 _gardenerDaiAmount,
    address payable _workerAddr,
    uint256 _workerDaiAmount,
    address payable _reviewerAddr,
    uint256 _reviewerDaiAmount,
    bytes32 _bountyId
  ) public onlyPayer {
    // TODO: requires

    IColony colony = IColony(colonyAddr);
    IERC20 dai = IERC20(daiAddr);

    // handle worker
    uint256 paymentId = colony.addPayment(0, 0, _gardenerAddr, leapAddr, _gardenerDaiAmount, 0, 0);
    dai.transferFrom(payerAddr, _gardenerAddr, _gardenerDaiAmount);
    emit Payout(_bountyId, PayoutType.Gardener, _gardenerAddr, _gardenerDaiAmount, paymentId);

    // handle worker
    paymentId = colony.addPayment(0, 0, _workerAddr, leapAddr, _workerDaiAmount, 0, 0);
    dai.transferFrom(payerAddr, _workerAddr, _workerDaiAmount);
    emit Payout(_bountyId, PayoutType.Gardener, _workerAddr, _workerDaiAmount, paymentId);

    // handle reviewer
    paymentId = colony.addPayment(0, 0, _reviewerAddr, leapAddr, _reviewerDaiAmount, 0, 0);
    dai.transferFrom(payerAddr, _reviewerAddr, _reviewerDaiAmount);
    emit Payout(_bountyId, PayoutType.Gardener, _reviewerAddr, _reviewerDaiAmount, paymentId);
  }
}