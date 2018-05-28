pragma solidity ^0.4.23;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

contract StakingAuction {
  using SafeMath for uint256;

  event Epoch(uint256 epoch);
  event NewHeight(uint256 blockNumber, bytes32 indexed root);
  event ValidatorJoin(address indexed signerAddr, uint256 epoch);
  event ValidatorLeave(address indexed signerAddr, uint256 epoch);
  
  bytes32 constant genesis = 0x4920616d207665727920616e6772792c20627574206974207761732066756e21; // "I am very angry, but it was fun!" @victor
  uint256 epochLength;       // length of epoch in periods (32 blocks)
  uint256 public lastCompleteEpoch; // height at which last epoch was completed
  uint256 lastEpochBlockHeight;
  uint32 parentBlockInterval; // how often epochs can be submitted max
  uint64 lastParentBlock; // last ethereum block when epoch was submitted
  bytes32 public tipHash;    // hash of first period that has extended chain to some height
  ERC20 token;
  
  struct Slot {
    address owner;
    uint64 stake;
    address signer;
    uint32 activationEpoch;
    address newOwner;
    uint64 newStake;
    address newSigner;
  }
  
  mapping(uint256 => Slot) slots;

  struct Period {
    bytes32 parent; // the id of the parent node
    uint32 height;  // the height of last block in period
    uint32 parentIndex; //  the position of this node in the Parent's children list
    uint8 slot;
    uint32 gasPrice;
    uint64 reward;
    bytes32[] children; // unordered list of children below this node
  }
  mapping(bytes32 => Period) public chain;
    
  constructor(ERC20 _token, uint256 _slotCount) public {
    require(_slotCount < 256);
    require(_slotCount >= 2);

    Period memory genPeriod;
    genPeriod.parent = genesis;
    genPeriod.height = 32;
    tipHash = genesis;
    chain[tipHash] = genPeriod;

    epochLength = _slotCount;
    require(_token != address(0));
    token = _token;
  }

  function getSlot(uint256 _slotId) constant public returns (address, uint64, address, uint32, address, uint64, address) {
    require(_slotId < epochLength);
    Slot memory slot = slots[_slotId];
    return (slot.owner, slot.stake, slot.signer, slot.activationEpoch, slot.newOwner, slot. newStake, slot.newSigner);
  }
  
  function bet(uint256 _slotId, uint256 _value, address _signerAddr) public {
    require(_slotId < epochLength);
    Slot storage slot = slots[_slotId];
    // take care of logout
    if (_value == 0 && slot.newStake == 0 && slot.signer == _signerAddr) {
      slot.activationEpoch = uint32(lastCompleteEpoch.add(3));
      return;
    }
    uint required = slot.stake;
    if (slot.newStake > required) {
      required = slot.newStake;
    }
    required = required.mul(105).div(100);
    require(required < _value);
    token.transferFrom(msg.sender, this, _value);
    if (slot.newStake > 0) {
      token.transfer(slot.newOwner, slot.newStake);
    }
    // auction
    if (slot.stake > 0) {
      slot.newOwner = msg.sender;
      slot.newSigner = _signerAddr;
      slot.newStake = uint64(_value);
      slot.activationEpoch = uint32(lastCompleteEpoch.add(3));
    }
    // new purchase
    else {
      slot.owner = msg.sender;
      slot.signer = _signerAddr;
      slot.stake = uint64(_value);
      slot.activationEpoch = 0;
      emit ValidatorJoin(slot.signer, lastCompleteEpoch + 1);
    }
  }
  
  function activate(uint256 _slotId) public {
    require(_slotId < epochLength);
    Slot storage slot = slots[_slotId];
    require(lastCompleteEpoch + 1 >= slot.activationEpoch);
    if (slot.stake > 0) {
      token.transfer(slot.owner, slot.stake);
      emit ValidatorLeave(slot.signer, lastCompleteEpoch + 1);
    }
    slot.owner = slot.newOwner;
    slot.signer = slot.newSigner;
    slot.stake = slot.newStake;
    slot.activationEpoch = 0;
    slot.newOwner = 0;
    slot.newSigner = 0;
    slot.newStake = 0;
    emit ValidatorJoin(slot.signer, lastCompleteEpoch + 1);
  }
  
  function submitPeriod(uint256 _slotId, bytes32 _prevHash, bytes32 _root) public {
    require(_slotId < epochLength);
    Slot storage slot = slots[_slotId];
    require(slot.signer == msg.sender);

    // check parent node exists
    require(chain[_prevHash].parent > 0);
    // calculate height
    uint256 newHeight = chain[_prevHash].height + 32;
    // do some magic if chain extended
    if (newHeight > chain[tipHash].height) {
      // new periods can only be submitted every x Ethereum blocks
      require(block.number >= lastParentBlock + parentBlockInterval);
      tipHash = _root;
      lastParentBlock = uint64(block.number);
      emit NewHeight(newHeight, _root);
    }
    // store the period
    Period memory newPeriod;
    newPeriod.parent = _prevHash;
    newPeriod.height = uint32(newHeight);
    newPeriod.slot = uint8(_slotId);
    newPeriod.parentIndex = uint32(chain[_prevHash].children.push(_root) - 1);
    chain[_root] = newPeriod;

    if (slot.activationEpoch > 0) {
      // if slot not active, prevent submission
      require(lastCompleteEpoch.add(2) < slot.activationEpoch);
    }
    // check if epoch completed
    if (newHeight >= lastEpochBlockHeight.add(epochLength.mul(32))) {
      lastCompleteEpoch++;
      lastEpochBlockHeight = newHeight;
    }
  }

  function deletePeriod(bytes32 hash) internal {
    Period storage parent = chain[chain[hash].parent];
    uint256 i = chain[hash].parentIndex;
    if (i < parent.children.length - 1) {
      // swap with last child
      parent.children[i] = parent.children[parent.children.length - 1];
    }
    parent.children.length--;
    if (hash == tipHash) {
      tipHash = chain[hash].parent;
    }
    delete chain[hash];
  }

  function getMerkleRoot(bytes32 _leaf, uint256 _index, uint256 _offset, bytes32[] _proof) internal pure returns (bytes32) {
    for (uint256 i = _offset; i < _proof.length; i++) {
      // solhint-disable-next-line no-inline-assembly
      if (_index % 2 == 0) {
        _leaf = keccak256(_leaf, _proof[i]);
      } else {
        _leaf = keccak256(_proof[i], _leaf);
      }
      _index = _index / 2;
    }
    return _leaf;
  }

  //validate that transaction is included to the block (merkle proof)
  function validateProof(uint256 offset, bytes32[] _proof) view internal returns (uint64 txPos, bytes32 txHash) {
    uint256 txLength = uint16(_proof[3] >> 224);
    bytes memory txData = new bytes(txLength);
    assembly {
      calldatacopy(add(txData, 0x20), add(178, offset), txLength)
    }
    txHash = keccak256(txData);
    txPos = uint64(_proof[3] >> 160);
    bytes32 root = getMerkleRoot(txHash, txPos, uint8(_proof[3] >> 240), _proof);
    require(root == _proof[0]);
  }


  function reportDoubleSpend(bytes32[] _proof, bytes32[] _prevProof) public {
    // make sure block can still be slashed
    Period memory p = chain[_proof[0]];

    // validate proofs
    uint256 offset = 32 * (_proof.length + 2);
    uint64 txPos1;
    (txPos1, ) = validateProof(offset + 10, _prevProof);

    uint64 txPos2;
    (txPos2, ) = validateProof(42, _proof);

    // make sure transactions are different
    require(_proof[0] != _prevProof[0] || txPos1 != txPos2);

    // get iputs and validate
    bytes32 prevHash1;
    bytes32 prevHash2;
    uint8 outPos1;
    uint8 outPos2;
    assembly {
      prevHash1 := calldataload(add(198, 32))
      outPos1 := calldataload(add(230, 32))
      prevHash2 := calldataload(add(198, offset))
      outPos2 := calldataload(add(230, offset))
    }

    // check that spending same outputs
    require(prevHash1 == prevHash2 && outPos1 == outPos2);
    // delete invalid period
    deletePeriod(_proof[0]);
    // EVENT
    // slash operator
     slash(p.slot, 50);
  }
  
  function slash(uint256 _slotId, uint256 _value) public {
    require(_slotId < epochLength);
    Slot storage slot = slots[_slotId];
    require(slot.stake > 0);
    uint256 prevStake = slot.stake;
    slot.stake = (_value >= slot.stake) ? 0 : slot.stake - uint64(_value);
    // if slot became empty by slashing
    if (prevStake > 0 && slot.stake == 0) {
      emit ValidatorLeave(slot.signer, lastCompleteEpoch + 1);
      slot.activationEpoch = 0;
      if (slot.newStake > 0) {
        // someone in queue
        activate(_slotId);
      } else {
        // clean out account
        slot.owner = 0;
        slot.signer = 0;
        slot.stake = 0;
      }
    }
  }
}