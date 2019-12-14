
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "./Bridge.sol";
import "./Vault.sol";
import "./TxLib.sol";

contract TokenGovernance {

  uint256 constant PROPOSAL_STAKE = 5000000000000000000000;
  uint32 constant PROPOSAL_TIME = 604800; // 60 * 60 * 24 * 7 = 7 days
  address public mvgAddress;
  IERC20 public leapToken;
  Bridge public bridge;
  Vault public vault;

  struct Proposal {
    address initiator;
    uint32 openTime;
    bool finalized;
    uint256 yesVotes;
    uint256 noVotes;
    mapping(address => int256) votes;
    mapping(bytes32 => address) usedTxns;
  }

  mapping(bytes32 => Proposal) public proposals;

  event ProposalRegistered(bytes32 indexed proposalHash, address indexed initiator);
  event VoiceCasted(bytes32 indexed proposalHash, address indexed subject, uint256 weight);
  event VoiceChallenged(bytes32 indexed proposalHash, address indexed subject, address challenger);
  event ProposalFinalized(bytes32 indexed proposalHash, bool isApproved);

  constructor(address _mvgAddress, IERC20 _leapToken, Vault _vault) public {
    mvgAddress = _mvgAddress;
    leapToken = _leapToken;
    vault = _vault;
    bridge = _vault.bridge();
  }

  function _revertVote(Proposal storage proposal, bytes32 txHash) internal {
    address signer = proposal.usedTxns[txHash];
    delete proposal.usedTxns[txHash];
    int256 votes = proposal.votes[signer];
    delete proposal.votes[signer];
    if (votes > 0) {
      proposal.yesVotes -= uint256(votes);
    } else {
      proposal.noVotes -= uint256(votes * -1);
    }
  }

  function registerProposal(bytes32 _proposalHash) public {
    // make sure same proposals hasn't been opened before
    require(proposals[_proposalHash].openTime == 0, "proposal already exists");
    // get instance of token contract and pull proposal stake
    leapToken.transferFrom(msg.sender, address(this), PROPOSAL_STAKE);
    // create a new proposal in storage
    proposals[_proposalHash] = Proposal(msg.sender, uint32(now), false, 0, 0);
    // emit event for frontend
    emit ProposalRegistered(_proposalHash, msg.sender);
  }

  function castVote(bytes32 _proposalHash, bytes32[] memory _proof, uint8 _outputIndex, bool isYes) public {
    Proposal memory proposal = proposals[_proposalHash];
    require(proposal.openTime > 0, "proposal does not exist");
    require(proposal.finalized == false, "proposal already finalized");
    uint32 timestamp;
    (, timestamp,,) = bridge.periods(_proof[0]);
    require(timestamp > 0, "The referenced period was not submitted to bridge");
    require(timestamp <= proposal.openTime, "The transaction was submitted after the vote open time");
    
    bytes memory txData;
    bytes32 txHash;
    (, txHash, txData) = TxLib.validateProof(96, _proof);

    // parse tx and check if it is usable for voting
    TxLib.Tx memory tx = TxLib.parseTx(txData);
    TxLib.Output memory out = tx.outs[_outputIndex];
    require(out.value > 0, "UTXO has no value");
    require(out.owner == msg.sender, "msg.sender not owner of utxo");
    // TODO: fix
    require(address(leapToken) == vault.getTokenAddr(out.color), "not Leap UTXO");

    if (proposals[_proposalHash].votes[msg.sender] != 0) {
      // TODO: clean up previous vote
      _revertVote(proposals[_proposalHash], txHash);
    }
    if (isYes) {
      proposals[_proposalHash].yesVotes += out.value;
      proposals[_proposalHash].votes[msg.sender] = int256(out.value);
    } else {
      proposals[_proposalHash].noVotes += out.value;
      proposals[_proposalHash].votes[msg.sender] = int256(out.value) * -1;
    }
    proposals[_proposalHash].usedTxns[txHash] = msg.sender;
    emit VoiceCasted(_proposalHash, msg.sender, out.value);
  }

  function challengeUTXO(bytes32 _proposalHash, bytes32[] memory _proof, uint8 _inputIndex, address _signer) public {
    uint32 timestamp;
    (, timestamp,,) = bridge.periods(_proof[0]);
    require(timestamp > 0, "The referenced period was not submitted to bridge");
    require(timestamp <= proposals[_proposalHash].openTime, "The transaction was submitted after the vote open time");
    
    bytes memory txData;
    bytes32 txHash;
    (, txHash, txData) = TxLib.validateProof(96, _proof);

    // parse tx
    TxLib.Tx memory txn = TxLib.parseTx(txData);
    // checking that the transactions has been used in a vote
    address signer = proposals[_proposalHash].usedTxns[txn.ins[_inputIndex].outpoint.hash];
    // note: we don't check the output index here, assume that each transactions is only used for 1 vote
    require(signer != address(0), "prevout check failed on hash");

    // substract vote
    _revertVote(proposals[_proposalHash], txHash);
    emit VoiceChallenged(_proposalHash, signer, msg.sender);
  }

  function finalizeProposal(bytes32 _proposalHash) public {
    Proposal memory proposal = proposals[_proposalHash];
    require(proposal.finalized == false, "already finalized");
    require(proposal.openTime > 0, "proposal does not exist");
    // disable to simplify testing
    // require(proposal.openTime + PROPOSAL_TIME < uint32(now), "proposal time not exceeded");
    // can't delete full mappings
    // delete proposals[_proposalHash].votes;
    // delete proposals[_proposalHash].usedTxns;
    proposals[_proposalHash].finalized = true;
    // return stake
    if (proposal.yesVotes > proposal.noVotes) {
      leapToken.transfer(proposal.initiator, PROPOSAL_STAKE);
      emit ProposalFinalized(_proposalHash, true);
    } else {
      leapToken.transfer(mvgAddress, PROPOSAL_STAKE);
      emit ProposalFinalized(_proposalHash, false);
    }
  }

}