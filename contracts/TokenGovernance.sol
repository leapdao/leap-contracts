
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";

contract TokenGovernance {

  uint256 constant PROPOSAL_STAKE = 5000000000000000000000;

  struct Proposal {
    address initiator;
    uint256 openTime;
    mapping(address => uint256) votes;
    bool finalized;
  }

  mapping(bytes32 => Proposal) public proposals;
  address public mvgAddress;
  address public leapAddr;

  event ProposalRegistered(bytes32 indexed ipfsHash, address indexed initiator);
  event VoiceCasted(uint256 indexed ipfsHash, address indexed subject, uint256 weight);
  event VoiceChallenged(uint256 indexed ipfsHash, address indexed subject, address challenger);
  event ProposalFinalized(bytes32 indexed ipfsHash, bool isApproved);


  constructor(address _mvgAddress, address _leapAddr) public {
    mvgAddress = _mvgAddress;
    leapAddr = _leapAddr;
  }

  function registerProposal(bytes32 _proposalHash) public {
    // make sure same proposals hasn't been opened before
    require(proposals[_proposalHash].openTime == 0, "proposal already exists");

    // get instance of token contract and pull proposal stake
    IERC20 leapToken = IERC20(leapAddr);
    leapToken.transferFrom(msg.sender, address(this), PROPOSAL_STAKE);

    // create a new proposal in storage
    proposals[_proposalHash] = Proposal(msg.sender, now, false);    

    // emit event for frontend
    emit ProposalRegistered(_proposalHash, msg.sender);
  }

}