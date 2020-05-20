/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */
pragma solidity ^0.5.12;
pragma experimental ABIEncoderV2; // solium-disable-line no-experimental


import "../misc/IColony.sol";

contract Colony is IColony {

  Payment[] payments;

  function addPayment(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address payable _recipient,
    address _token,
    uint256 _amount,
    uint256 _domainId,
    uint256 _skillId) external returns (uint256 paymentId) {
    uint256[] memory skills;
    // solium-disable-next-line arg-overflow
    Payment memory payment = Payment(msg.sender, false, 1, 1, skills);
    paymentId = payments.length++;
    payments[paymentId] = payment;
  }

  /// @notice Returns an exiting payment.
  /// @param _id Payment identifier
  /// @return payment The Payment data structure
  function getPayment(uint256 _id) external view returns (Payment memory) {
    return payments[_id];
  }

  function moveFundsBetweenPots(
    uint256 _permissionDomainId,
    uint256 _fromChildSkillIndex,
    uint256 _toChildSkillIndex,
    uint256 _fromPot,
    uint256 _toPot,
    uint256 _amount,
    address _token
    ) external {

  }

  function finalizePayment(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id) external {
    payments[_id].finalized = true;
  }

  function claimPayment(uint256 _id, address _token) external {
  }
}