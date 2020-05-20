/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity ^0.5.12;
pragma experimental ABIEncoderV2; // solium-disable-line no-experimental


interface IColony {

  struct Payment {
    address payable recipient;
    bool finalized;
    uint256 fundingPotId;
    uint256 domainId;
    uint256[] skills;
  }

  // Implemented in ColonyPayment.sol
  /// @notice Add a new payment in the colony. Secured function to authorised members.
  /// @param _permissionDomainId The domainId in which I have the permission to take this action
  /// @param _childSkillIndex The index that the `_domainId` is relative to `_permissionDomainId`,
  /// (only used if `_permissionDomainId` is different to `_domainId`)
  /// @param _recipient Address of the payment recipient
  /// @param _token Address of the token, `0x0` value indicates Ether
  /// @param _amount Payout amount
  /// @param _domainId The domain where the payment belongs
  /// @param _skillId The skill associated with the payment
  /// @return paymentId Identifier of the newly created payment
  function addPayment(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address payable _recipient,
    address _token,
    uint256 _amount,
    uint256 _domainId,
    uint256 _skillId)
    external returns (uint256 paymentId);

  /// @notice Returns an exiting payment.
  /// @param _id Payment identifier
  /// @return payment The Payment data structure
  function getPayment(uint256 _id) external view returns (Payment memory payment);

  /// @notice Move a given amount: `_amount` of `_token` funds from funding pot with id `_fromPot` to one with id `_toPot`.
  /// @param _permissionDomainId The domainId in which I have the permission to take this action
  /// @param _fromChildSkillIndex The child index in `_permissionDomainId` where we can find the domain for `_fromPotId`
  /// @param _toChildSkillIndex The child index in `_permissionDomainId` where we can find the domain for `_toPotId`
  /// @param _fromPot Funding pot id providing the funds
  /// @param _toPot Funding pot id receiving the funds
  /// @param _amount Amount of funds
  /// @param _token Address of the token, `0x0` value indicates Ether
  function moveFundsBetweenPots(
    uint256 _permissionDomainId,
    uint256 _fromChildSkillIndex,
    uint256 _toChildSkillIndex,
    uint256 _fromPot,
    uint256 _toPot,
    uint256 _amount,
    address _token
    ) external;

  /// @notice Finalizes the payment and logs the reputation log updates.
  /// Allowed to be called once after payment is fully funded. Secured function to authorised members.
  /// @param _permissionDomainId The domainId in which I have the permission to take this action
  /// @param _childSkillIndex The index that the `_domainId` is relative to `_permissionDomainId`
  /// @param _id Payment identifier
  function finalizePayment(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id) external;

  /// @notice Claim the payout in `_token` denomination for payment `_id`. Here the network receives its fee from each payout.
  /// Same as for tasks, ether fees go straight to the Meta Colony whereas Token fees go to the Network to be auctioned off.
  /// @param _id Payment identifier
  /// @param _token Address of the token, `0x0` value indicates Ether
  function claimPayment(uint256 _id, address _token) external;
}