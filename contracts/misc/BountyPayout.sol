/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */
pragma solidity 0.5.2;
pragma experimental ABIEncoderV2;


import "./IColony.sol";
import "../../node_modules/openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";

contract BountyPayout {

  uint256 constant DAI_DECIMALS = 10^18;
  uint256 constant PERMISSION_DOMAIN_ID = 1;
  uint256 constant CHILD_SKILL_INDEX = 0;
  uint256 constant DOMAIN_ID = 1;
  uint256 constant SKILL_ID = 0;

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

  function makePayment(address payable _worker, uint256 _amount) internal returns (uint256) {

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
  ) internal  {

    IERC20 dai = IERC20(daiAddr);

    // gardener worker
    // Why is a gardener share required?
    // Later we will hold a stake for gardeners, which will be handled here.
    require(_gardenerDaiAmount > DAI_DECIMALS, "gardener amount too small");
    uint256 paymentId = makePayment(_gardenerAddr, _gardenerDaiAmount);
    dai.transferFrom(payerAddr, _gardenerAddr, _gardenerDaiAmount);
    emit Payout(_bountyId, PayoutType.Gardener, _gardenerAddr, _gardenerDaiAmount, paymentId);

    // handle worker
    if (_workerDaiAmount > 0) {
      paymentId = makePayment(_workerAddr, _workerDaiAmount);
      dai.transferFrom(payerAddr, _workerAddr, _workerDaiAmount);
      emit Payout(_bountyId, PayoutType.Worker, _workerAddr, _workerDaiAmount, paymentId);
    }

    // handle reviewer
    if (_reviewerDaiAmount > 0) {
      paymentId = makePayment(_reviewerAddr, _reviewerDaiAmount);
      dai.transferFrom(payerAddr, _reviewerAddr, _reviewerDaiAmount);
      emit Payout(_bountyId, PayoutType.Reviewer, _reviewerAddr, _reviewerDaiAmount, paymentId);
    }
  }

 /**
  * Pays out a bounty to the different roles of a bounty
  *
  * @dev This contract should have enough allowance of daiAddr from payerAddr
  * @dev This colony contract should have enough LEAP in its funding pot
  * @param _gardenerAddr gardener wallet address
  * @param _gardenerDaiAmount DAI amount to pay gardner
  * @param _workerAddr worker wallet address
  * @param _workerDaiAmount DAI amount to pay worker
  * @param _reviewerAddr reviewer wallet address
  * @param _reviewerDaiAmount DAI amount to pay reviewer
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
    _payout(
      _gardenerAddr,
      _gardenerDaiAmount,
      _workerAddr,
      _workerDaiAmount,
      _reviewerAddr,
      _reviewerDaiAmount,
      _bountyId
    );
  }

  function payoutNoWorker(
    address payable _gardenerAddr,
    uint256 _gardenerDaiAmount,
    address payable _reviewerAddr,
    uint256 _reviewerDaiAmount,
    bytes32 _bountyId
  ) public onlyPayer {
    _payout(
      _gardenerAddr,
      _gardenerDaiAmount,
      _reviewerAddr,
      0,
      _reviewerAddr,
      _reviewerDaiAmount,
      _bountyId
    );
  }

  function payoutNoReviewer(
    address payable _gardenerAddr,
    uint256 _gardenerDaiAmount,
    address payable _workerAddr,
    uint256 _workerDaiAmount,
    bytes32 _bountyId
  ) public onlyPayer {
    _payout(
      _gardenerAddr,
      _gardenerDaiAmount,
      _workerAddr,
      _workerDaiAmount,
      _workerAddr,
      0,
      _bountyId
    );
  }
}