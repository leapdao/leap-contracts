
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

import "./Adminable.sol";
import "./ExitHandler.sol";
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

  ExitHandler public vault;
  Bridge public bridge;

  uint256 public epochLength; // length of epoch in periods (32 blocks)
  uint256 public lastCompleteEpoch; // height at which last epoch was completed
  uint256 public lastEpochBlockHeight;

  mapping(uint256 => Slot) public slots;


  function initialize(
    Bridge _bridge,
    ExitHandler _vault,
    uint256 _epochLength,
    uint256 _casChallengeDuration
  ) public initializer {
    vault = _vault;
    bridge = _bridge;
    epochLength = _epochLength;
    casChallengeDuration = _casChallengeDuration;
    emit EpochLength(epochLength);
  }

  function setHeartbeatParams(uint256 _minimumPulse, uint16 _heartbeatColor) public ifAdmin {
    minimumPulse = _minimumPulse;
    heartbeatColor = _heartbeatColor;
  }

  function setEpochLength(uint256 _epochLength) public ifAdmin {
    require(_epochLength >= _getLargestSlot() + 1, "Epoch length cannot be less then biggest slot");
    epochLength = _epochLength;
    emit EpochLength(epochLength);
  }

  function setSlot(uint256 _slotId, address _signerAddr, bytes32 _tenderAddr) public ifAdmin {
    _setSlot(_slotId, _signerAddr, _tenderAddr);
  }

  function setTakenSlotBitmap(uint256 _before, uint256 _pos, bool isActive) internal pure returns (uint256) {
    if (isActive) {
      return _before | (0x01 << (255 - _pos));
    } else {
      // if the bit is on, turn it off through XOR
      if (_before | (0x01 << (255 - _pos)) > 0) {
        return _before ^ (0x01 << (255 - _pos));
      }
    }
  }

  function _setSlot(uint256 _slotId, address _signerAddr, bytes32 _tenderAddr) internal  {
    require(_slotId < epochLength, "out of range slotId");
    Slot storage slot = slots[_slotId];

    // taking empty slot
    if (slot.signer == address(0)) {
      slot.owner = _signerAddr;
      slot.signer = _signerAddr;
      slot.tendermint = _tenderAddr;
      slot.activationEpoch = 0;
      slot.eventCounter++;
      takenSlots = setTakenSlotBitmap(takenSlots, _slotId, true);
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
      takenSlots = setTakenSlotBitmap(takenSlots, _slotId, false);
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
      takenSlots = setTakenSlotBitmap(takenSlots, _slotId, true);
      emit ValidatorJoin(
        slot.signer,
        _slotId,
        slot.tendermint,
        slot.eventCounter,
        lastCompleteEpoch + 1
      );
    }
  }

  function isSlotActive(Slot memory  _slot) internal pure returns (bool) {
    return (_slot.signer != address(0) && _slot.activationEpoch == 0);
  }

  event Submission(
    bytes32 indexed blocksRoot,
    uint256 indexed slotId,
    address indexed owner,
    bytes32 casBitmap,
    bytes32 periodRoot
  );

  function submitPeriodWithCas(
    uint256 _slotId,
    bytes32 _prevHash,
    bytes32 _blocksRoot,
    bytes32 _casBitmap
  ) public {
    require(_checkSigs(uint256(_casBitmap), takenSlots, epochLength), "incorrect number of sigs");
    _submitPeriod(_slotId, _prevHash, _blocksRoot, _casBitmap); // solium-disable-line arg-overflow
  }

  function submitPeriod(
    uint256 _slotId,
    bytes32 _prevHash,
    bytes32 _blocksRoot
  ) public {
    _submitPeriod(_slotId, _prevHash, _blocksRoot, 0); // solium-disable-line arg-overflow
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

  uint256 public casChallengeDuration;

  function setCasChallengeDuration(uint256 _casChallengeDuration) public ifAdmin {
    casChallengeDuration = _casChallengeDuration;
  }

  // casProof lookes like this:
  // [casBitmap, validatorRoot, consensusRoot]
  function challengeCas(
    bytes32 _casBitmap,
    bytes32 _validatorRoot,
    bytes32 _consensusRoot,
    uint256 _slotId
  ) public payable {

    bytes32 periodRoot;
    // casRoot
    assembly {
      mstore(0, _casBitmap)
      mstore(0x20, _validatorRoot)
      periodRoot := keccak256(0, 0x40)
    }
    // periodRoot
    assembly {
      mstore(0, _consensusRoot)
      mstore(0x20, periodRoot)
      periodRoot := keccak256(0, 0x40)
    }

    require(msg.value == vault.exitStake(), "invalid challenge stake");

    uint256 periodTime;
    (,periodTime,,) = bridge.periods(periodRoot);
    // check periodRoot
    require(periodTime > 0, "period does not exist");
    // check slotId
    require(_slotId < epochLength, "slotId too high");
    // check that sig was actually 1
    require(uint8(uint256(_casBitmap) >> (256 - _slotId)) & 0x01 == 1, "challenged sig not claimed");
    // check that challenge doesn't exist yet
    require(challenges[periodRoot][_slotId].endTime == 0, "challenge already in progress");
    // don't start challenges on super old periods
    require(periodTime >= uint32(now - casChallengeDuration), "period too old");
    // create challenge object
    challenges[periodRoot][_slotId] = Challenge({
      challenger: msg.sender,
      endTime: uint32(now + casChallengeDuration),
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
    address _msgSender
  ) public {
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
      // solium-disable-next-line arg-overflow
      ecrecover(_consensusRoot, _v, _r, _s) == challenges[periodRoot][_slotId].slotSigner,
      "signature does not match"
    );
    // delete period Root

    delete challenges[periodRoot][_slotId];
    // dispense reward
    require(msg.sender == _msgSender, "no frontrunning plz");
    msg.sender.transfer(vault.exitStake());
  }

  function timeoutCas(bytes32 _period, uint256 _slotId) public {
    Challenge memory chal = challenges[_period][_slotId];
    // check that challenge exists
    require(chal.endTime > 0, "challenge does not exist");
    // check time
    require(now >= chal.endTime, "time not expired yet");
    // transfer funds
    chal.challenger.transfer(vault.exitStake());
    // delete period
    bridge.deletePeriod(_period);
  }

  // openTime could be derived from openPeriodHash's timestamp, but one has
  // to determine what happens in the case that there was a long  (~ timeoutTime) time since
  // the last submitted period, than it is possible to  open and timeout a challenge straight
  // away
  struct BeatChallenge {
    address payable challenger;
    uint256 openTime;
    bytes32 openPeriodHash;
  }

  uint256 public minimumPulse; // max amount of periods one can go without a heartbeat
  uint16 public heartbeatColor;
  mapping(address => BeatChallenge) public beatChallenges;
  uint256 public takenSlots;
  
  // challenger claims that there is no hearbeat included in the previous minimumPulse periods
  // TODO: figure out what happens in slot rotation
  // TODO: must be sure that the surrent slot signer was also signer at minimumPulse periods ago
  function challengeBeat(
    uint256 _slotId
  ) public payable {
    // check the stake
    require(msg.value == vault.exitStake(), "invalid challenge stake");
    
    // check slot exists
    require(_slotId < epochLength, "slotId too high");

    // get the offending slot
    Slot memory slot = slots[_slotId];
    require(isSlotActive(slot), "Slot must be active");

    bytes32 tip = bridge.tipHash();
    
    // check that challenge doesn't exist yet
    // TODO: the slot signer can challenge himself, blocking further challenges for challengeTimeout duration. What are the implications of this?
    require(beatChallenges[slot.signer].openTime == 0, "challenge already in progress");

    // create challenge object
    // TODO: only one challenge per address possible, potential problem if an address holds multiple slots 
    beatChallenges[slot.signer] = BeatChallenge({
      challenger: msg.sender,
      openTime: now,
      openPeriodHash: tip
    });
  }

  // In case of an invalid challenge, can submit a proof of heartbeat
  // TODO: Is the signer we challenged still in control of the Slot? Depends on timeout-time (currently casChallangeDuration) at the least.
  function respondBeat(
    bytes32[] memory _inclusionProof,
    bytes32[] memory _walkProof,
    uint256 _slotId
  ) public {
   
    address slotSigner = slots[_slotId].signer;
    BeatChallenge memory chall = beatChallenges[slotSigner];

    require(chall.openTime > 0, "No active challenge for this slot.");
    // THIS IS CURRENTLY ONLY SAFE IF MINIMUM_PULSE IS SET TO 0!
    (bytes32 walkStart, bytes32 walkEnd, uint256 walkLength) = _verifyWalk(_walkProof);
    require(walkLength <= minimumPulse, "Walk goes back in time too far");
    require(walkStart == _inclusionProof[0], "Walk must start with the period that includes the heartbeat");
    require(walkEnd == chall.openPeriodHash, "Walk must end with the openPeriod");

    bytes32 txHash;
    bytes memory txData;
    uint64 txPos;
    (txPos, txHash, txData) = TxLib.validateProof(64, _inclusionProof);
    bytes32 sigHash = TxLib.getSigHash(txData);
    TxLib.Tx memory txn = TxLib.parseTx(txData);
    
    address payable txSigner = address(
      uint160(
        ecrecover(
          sigHash,
          txn.ins[0].v,
          txn.ins[0].r,
          txn.ins[0].s
        )
      )
    );
    uint16 txColor = txn.outs[0].color;
 
    require(slotSigner == txSigner, "Heartbeat transation does not belong to slot signer");
    require(txColor == heartbeatColor, "The transaction is not the correct color");
    
    delete beatChallenges[slotSigner];
    txSigner.transfer(vault.exitStake());
  }

  // walks on periods in the proof and verifies:
  // - they were included in the bridge
  // - they reference one another
  // also returns start and end period and the length of the walk
  // TODO: actually implement this
  function _verifyWalk(bytes32[] memory _proof) internal returns (bytes32, bytes32, uint256) {
    return (_proof[0], _proof[0], 0);
  }

  // Challenge time has passed. No counter-example was given. The validator is ruled to have been offline and gets removed.
  // TODO: Is the signer we challenged still in control of the Slot? Depends on timeout-time (currently casChallangeDuration) at the least.
  function timeoutBeat(uint256 _slotId) public {
    address signer = slots[_slotId].signer;
    BeatChallenge memory chal = beatChallenges[signer];
    
    // check that challenge exists
    require(chal.openTime > 0, "challenge does not exist");
    // check time
    require(now >= chal.openTime + casChallengeDuration, "time not expired yet");

    // refund challenge stake
    chal.challenger.transfer(vault.exitStake());

    // empty slot
    _setSlot(_slotId, address(0), 0);

    // Delete the challenge
    delete beatChallenges[signer];

    // todo: later slash stake here
  }

  function _isEmpty(Slot memory _slot) internal returns (bool) {
    return (_slot.signer == address(0));
  }

  function _getLargestSlot() internal returns (uint256) {
    uint256 slotId = epochLength;
    do {
      slotId--;
    } while (_isEmpty(slots[slotId]));
    return slotId;
  }

  // an exact amount of sigs is needed, so that if one is proven to be invalid,
  // then the amount of signatures drops below the 2/3 quorum => period is deleted
  function _checkSigs(uint256 _sigs, uint256 _activeSlots, uint256 _epochLength) internal pure returns (bool) {
    uint256 i = 256;
    uint256 active = 0;
    uint256 found = 0;
    do {
      i--;
      found += uint8(_sigs >> i) & 0x01;
      active += uint8(_activeSlots >> i) & 0x01;
    } while (i > 256 - _epochLength);
    // calculate n = 3f + 1
    return ((active * 2 / 3) + 1 == found);
  }

  function _submitPeriod(
    uint256 _slotId,
    bytes32 _prevHash,
    bytes32 _blocksRoot,
    bytes32 _casBitmap
  ) internal {
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
      mstore(0, _casBitmap)
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
      _casBitmap,
      hashRoot
    );
  }

  // solium-disable-next-line mixedcase
  uint256[14] private ______gap;
}
