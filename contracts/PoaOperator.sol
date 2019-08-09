
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

import "./Adminable.sol";
import "./Vault.sol";
import "./Bridge.sol";

contract PoaOperator is Adminable {

  event Epoch(uint256 epoch);
  event EpochLength(uint256 epochLength);

  event ValidatorJoin(
    address indexed signerAddr,
    uint256 indexed slotId,
    bytes32 indexed tenderAddr,
    uint256 eventCounter,
    uint256 epoch
  );

  event ValidatorLogout(
    address indexed signerAddr,
    uint256 indexed slotId,
    bytes32 indexed tenderAddr,
    address newSigner,
    uint256 eventCounter,
    uint256 epoch
  );

  event ValidatorLeave(
    address indexed signerAddr,
    uint256 indexed slotId,
    bytes32 indexed tenderAddr,
    uint256 epoch
  );

  event ValidatorUpdate(
    address indexed signerAddr,
    uint256 indexed slotId,
    bytes32 indexed tenderAddr,
    uint256 eventCounter
  );

  struct Slot {
    uint32 eventCounter;
    address owner;
    uint64 stake;
    address signer;
    bytes32 tendermint;
    uint32 activationEpoch;
    address newOwner;
    uint64 newStake;
    address newSigner;
    bytes32 newTendermint;
  }

  Vault public vault;
  Bridge public bridge;

  uint256 public epochLength; // length of epoch in periods (32 blocks)
  uint256 public lastCompleteEpoch; // height at which last epoch was completed
  uint256 public lastEpochBlockHeight;

  mapping(uint256 => Slot) public slots;


  function initialize(Bridge _bridge, Vault _vault, uint256 _epochLength) public initializer {
    vault = _vault;
    bridge = _bridge;
    epochLength = _epochLength;
    emit EpochLength(epochLength);
  }

  function setEpochLength(uint256 _epochLength) public ifAdmin {
    epochLength = _epochLength;
    emit EpochLength(epochLength);
  }

  function setSlot(uint256 _slotId, address _signerAddr, bytes32 _tenderAddr) public ifAdmin {
    require(_slotId < epochLength, "out of range slotId");
    Slot storage slot = slots[_slotId];

    // taking empty slot
    if (slot.signer == address(0)) {
      slot.owner = _signerAddr;
      slot.signer = _signerAddr;
      slot.tendermint = _tenderAddr;
      slot.activationEpoch = 0;
      slot.eventCounter++;
      emit ValidatorJoin(
        slot.signer,
        _slotId,
        _tenderAddr,
        slot.eventCounter,
        lastCompleteEpoch + 1
      );
      return;
    }
    // emptying slot
    if (_signerAddr == address(0) && _tenderAddr == 0) {
      slot.activationEpoch = uint32(lastCompleteEpoch + 3);
      slot.eventCounter++;
      emit ValidatorLogout(
        slot.signer,
        _slotId,
        _tenderAddr,
        address(0),
        slot.eventCounter,
        lastCompleteEpoch + 3
      );
      return;
    }
  }

  function activate(uint256 _slotId) public {
    require(_slotId < epochLength, "out of range slotId");
    Slot storage slot = slots[_slotId];
    require(lastCompleteEpoch + 1 >= slot.activationEpoch, "activation epoch not reached yet");
    if (slot.signer != address(0)) {
      emit ValidatorLeave(
        slot.signer,
        _slotId,
        slot.tendermint,
        lastCompleteEpoch + 1
      );
    }
    slot.owner = slot.newOwner;
    slot.signer = slot.newSigner;
    slot.tendermint = slot.newTendermint;
    slot.activationEpoch = 0;
    slot.newSigner = address(0);
    slot.newTendermint = 0x0;
    slot.eventCounter++;
    if (slot.signer != address(0)) {
      emit ValidatorJoin(
        slot.signer,
        _slotId,
        slot.tendermint,
        slot.eventCounter,
        lastCompleteEpoch + 1
      );
    }
  }

  event Submission(
    bytes32 indexed blocksRoot,
    uint256 indexed slotId,
    address indexed owner,
    bytes32 casRoot,
    bytes32 periodRoot
  );

  function countSigs(uint256 _sigs, uint256 _epochLength) internal pure returns (uint256 count) {
    for (uint i = 256; i >= 256 - _epochLength; i--) {
      count += uint8(_sigs >> i) & 0x01;
    }
  }

  // an exact amount of sigs is needed, so that if one is proven to be invalid,
  // then the amount of signatures drops below the 2/3 quorum => period is deleted
  function neededSigs(uint256 _epochLength) internal pure returns (uint256 needed) {
    // if the number of slots has a remainder, add 1
    //   example: 5, remainder 1, => 3 + 1
    // if the number of slots has no remainder, use it
    //   example: 9, remainder 0, => 6 + 0
    return (_epochLength * 2 / 3) + ((_epochLength * 2 % 3) == 0 ? 0 : 1);
  }

  function _submitPeriod(uint256 _slotId, bytes32 _prevHash, bytes32 _blocksRoot, bytes32 _cas) internal {
    require(_slotId < epochLength, "Incorrect slotId");
    Slot storage slot = slots[_slotId];
    require(slot.signer == msg.sender, "not submitted by signerAddr");
    // This is here so that I can submit in the same epoch I auction/logout but not after
    if (slot.activationEpoch > 0) {
      // if slot not active, prevent submission
      require(lastCompleteEpoch + 2 < slot.activationEpoch, "slot not active");
    }

    // validator root
    bytes32 hashRoot = bytes32(_slotId << 160 | uint160(slot.owner));
    assembly {
      mstore(0, hashRoot)
      mstore(0x20, 0x0000000000000000000000000000000000000000)
      hashRoot := keccak256(0, 0x40)
    }
    // cas root
    assembly {
      mstore(0, _cas)
      mstore(0x20, hashRoot)
      hashRoot := keccak256(0, 0x40)
    }

    // consensus root
    bytes32 consensusRoot;
    assembly {
      mstore(0, _blocksRoot)
      mstore(0x20, 0x0000000000000000000000000000000000000000)
      consensusRoot := keccak256(0, 0x40)
    }

    // period root
    assembly {
      mstore(0, consensusRoot)
      mstore(0x20, hashRoot)
      hashRoot := keccak256(0, 0x40)
    }

    uint256 newHeight = bridge.submitPeriod(_prevHash, hashRoot);
    // check if epoch completed
    if (newHeight >= lastEpochBlockHeight + epochLength) {
      lastCompleteEpoch++;
      lastEpochBlockHeight = newHeight;
      emit Epoch(lastCompleteEpoch);
    }
    emit Submission(
      _blocksRoot,
      _slotId,
      slot.owner,
      _cas,
      hashRoot
    );
  }

  function submitPeriodWithCas(uint256 _slotId, bytes32 _prevHash, bytes32 _blocksRoot, bytes32 _cas) public {
    require(countSigs(uint256(_cas), epochLength) == neededSigs(epochLength), "incorrect number of sigs");
    _submitPeriod(_slotId, _prevHash, _blocksRoot, _cas);
  }

  function submitPeriod(uint256 _slotId, bytes32 _prevHash, bytes32 _blocksRoot) public {
    _submitPeriod(_slotId, _prevHash, _blocksRoot, 0);
  }

  struct Challenge {
    address payable challenger;
    uint32 endTime;
    address slotSigner;
  }

  mapping(bytes32 => mapping(uint256 => Challenge)) challenges;

  function getChallenge(bytes32 _period, uint256 _slotId) public view returns (address, uint256, address) {
    Challenge memory chal = challenges[_period][_slotId];
    return (chal.challenger, chal.endTime, chal.slotSigner);
  }

  uint256 constant CHAL_DURATION = 3600; // 1 hour
  uint256 constant CHAL_STAKE = 100000000000000000; // 0.1 ETH

  // casProof lookes like this:
  // [casBitmap, validatorRoot, consensusRoot]
  function challengeCas(
    bytes32 _casBitmap,
    bytes32 _validatorRoot, 
    bytes32 _consensusRoot,
    uint256 _slotId) public payable {

    bytes32 periodRoot;
    // casRoot
    assembly {
      mstore(0, _casBitmap)
      mstore(0x20, _consensusRoot)
      periodRoot := keccak256(0, 0x40)
    }
    // periodRoot
    assembly {
      mstore(0, _consensusRoot)
      mstore(0x20, periodRoot)
      periodRoot := keccak256(0, 0x40)
    }
    require(msg.value == CHAL_STAKE, "invalid challenge stake");

    uint256 periodTime;
    (,periodTime,,) = bridge.periods(periodRoot);
    // check periodRoot
    require(periodTime > 0, "period does not exist");
    // check slotId
    require(_slotId < epochLength, "slotId too high");
    // check that sig was actually 1
    require(uint8(uint256(_casBitmap) >> _slotId) & 0x01 == 1, "challanged sig not claimed");
    // check that challenge doesn't exist yet
    require(challenges[periodRoot][_slotId].endTime == 0, "challenge already in progress");
    // don't start challenges on super old periods
    require(periodTime >= uint32(now - CHAL_DURATION), "period too old");
    // create challenge object
    challenges[periodRoot][_slotId] = Challenge({
      challenger: msg.sender,
      endTime: uint32(now + CHAL_DURATION),
      slotSigner: slots[_slotId].signer
    });
  }

  function respondCas(
    bytes32 _consensusRoot,
    bytes32 _casRoot,
    uint256 _slotId,
    uint8 _v,
    bytes32 _r,
    bytes32 _s,
    bytes32 _msgSenderHash) public {
    bytes32 periodRoot;
    assembly {
      mstore(0, _consensusRoot)
      mstore(0x20, _casRoot)
      periodRoot := keccak256(0, 0x40)
    }
    // check that challenge exists
    require(challenges[periodRoot][_slotId].endTime != 0, "challenge does not exist");
    // formally correct, but not desired
    // require(now < challenges[_period][_slotId].endTime, "already expired");
    // check that signature matches
    require(
      ecrecover(_consensusRoot, _v, _r, _s) == challenges[periodRoot][_slotId].slotSigner,
      "signature does not match"
    );
    // delete period Root

    delete challenges[periodRoot][_slotId];
    // dispense reward
    require(keccak256(abi.encode(msg.sender)) == _msgSenderHash, "no frontrunning plz");
    msg.sender.transfer(CHAL_STAKE);
  }

  function timeoutCas(bytes32 _period, uint256 _slotId) public {
    Challenge memory chal = challenges[_period][_slotId];
    // check that challenge exists
    require(chal.endTime > 0, "challenge does not exist");
    // check time
    require(now >= chal.endTime, "time not expired yet");
    // transfer funds
    chal.challenger.transfer(CHAL_STAKE);
    // delete period
    bridge.deletePeriod(_period);
  }

}