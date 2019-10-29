/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */
pragma solidity 0.5.2;
pragma experimental ABIEncoderV2;


import "./IColony.sol";
import "../../node_modules/openzeppelin-solidity/contracts/access/roles/CapperRole.sol";
import "../../node_modules/openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";

contract BountyPayout is CapperRole {

  uint256 constant DAI_DECIMALS = 10^18;
  uint256 constant PERMISSION_DOMAIN_ID = 1;
  uint256 constant CHILD_SKILL_INDEX = 0;
  uint256 constant DOMAIN_ID = 1;
  uint256 constant SKILL_ID = 0;

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
    address _colonyAddr,
    address _daiAddr,
    address _leapAddr) public {
    colonyAddr = _colonyAddr;
    daiAddr = _daiAddr;
    leapAddr = _leapAddr;
  }

  function _isRepOnly(uint256 amount) internal returns (bool) {
    return ((amount & 0x01) == 1);
  }

  function _makeColonyPayment(address payable _worker, uint256 _amount) internal returns (uint256) {

    IColony colony = IColony(colonyAddr);
    // Add a new payment
    uint256 paymentId = colony.addPayment(
      PERMISSION_DOMAIN_ID,
      CHILD_SKILL_INDEX,
      _worker,
      leapAddr,
      _amount,
      DOMAIN_ID,
      SKILL_ID
    );
    IColony.Payment memory payment = colony.getPayment(paymentId);

    // Fund the payment
    colony.moveFundsBetweenPots(
      1, // Root domain always 1
      0, // Not used, this extension contract must have funding permission in the root for this function to work
      CHILD_SKILL_INDEX,
      1, // Root domain funding pot is always 1
      payment.fundingPotId,
      _amount,
      leapAddr
    );
    colony.finalizePayment(PERMISSION_DOMAIN_ID, CHILD_SKILL_INDEX, paymentId);

    // Claim payout on behalf of the recipient
    colony.claimPayment(paymentId, leapAddr);
    return paymentId;
  }

  function _payout(
    address payable _gardenerAddr,
    uint256 _gardenerDaiAmount,
    address payable _workerAddr,
    uint256 _workerDaiAmount,
    address payable _reviewerAddr,
    uint256 _reviewerDaiAmount,
    bytes32 _bountyId
  ) internal {
    IERC20 dai = IERC20(daiAddr);

    // gardener worker
    // Why is a gardener share required?
    // Later we will hold a stake for gardeners, which will be handled here.
    require(_gardenerDaiAmount > DAI_DECIMALS, "gardener amount too small");
    uint256 paymentId = _makeColonyPayment(_gardenerAddr, _gardenerDaiAmount);
    if (!_isRepOnly(_gardenerDaiAmount)) {
      dai.transferFrom(msg.sender, _gardenerAddr, _gardenerDaiAmount);
    }
    emit Payout(_bountyId, PayoutType.Gardener, _gardenerAddr, _gardenerDaiAmount, paymentId);

    // handle worker
    if (_workerDaiAmount > 0) {
      paymentId = _makeColonyPayment(_workerAddr, _workerDaiAmount);
      if (!_isRepOnly(_workerDaiAmount)) {
        dai.transferFrom(msg.sender, _workerAddr, _workerDaiAmount);
      }
      emit Payout(_bountyId, PayoutType.Worker, _workerAddr, _workerDaiAmount, paymentId);
    }

    // handle reviewer
    if (_reviewerDaiAmount > 0) {
      paymentId = _makeColonyPayment(_reviewerAddr, _reviewerDaiAmount);
      if (!_isRepOnly(_reviewerDaiAmount)) {
        dai.transferFrom(msg.sender, _reviewerAddr, _reviewerDaiAmount);
      }
      emit Payout(_bountyId, PayoutType.Reviewer, _reviewerAddr, _reviewerDaiAmount, paymentId);
    }
  }

 /**
  * Pays out a bounty to the different roles of a bounty
  *
  * @dev This contract should have enough allowance of daiAddr from payerAddr
  * @dev This colony contract should have enough LEAP in its funding pot
  * @param _gardener DAI amount to pay gardner and gardener wallet address
  * @param _worker DAI amount to pay worker and worker wallet address
  * @param _reviewer DAI amount to pay reviewer and reviewer wallet address
  */
  function payout(
    bytes32 _gardener,
    bytes32 _worker,
    bytes32 _reviewer,
    bytes32 _bountyId
  ) public onlyCapper {
    _payout(
      address(bytes20(_gardener)),
      uint96(uint256(_gardener)),
      address(bytes20(_worker)),
      uint96(uint256(_worker)),
      address(bytes20(_reviewer)),
      uint96(uint256(_reviewer)),
      _bountyId
    );
  }

  function payoutReviewedDelivery(
    bytes32 _gardener,
    bytes32 _reviewer,
    bytes32 _bountyId
  ) public onlyCapper {
    _payout(
      address(bytes20(_gardener)),
      uint96(uint256(_gardener)),
      address(bytes20(_gardener)),
      0,
      address(bytes20(_reviewer)),
      uint96(uint256(_reviewer)),
      _bountyId
    );
  }

  function payoutNoReviewer(
    bytes32 _gardener,
    bytes32 _worker,
    bytes32 _bountyId
  ) public onlyCapper {
    _payout(
      address(bytes20(_gardener)),
      uint96(uint256(_gardener)),
      address(bytes20(_worker)),
      uint96(uint256(_worker)),
      address(bytes20(_gardener)),
      0,
      _bountyId
    );
  }
}