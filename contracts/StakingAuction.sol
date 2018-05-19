pragma solidity ^0.4.23;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

contract StakingAuction {
    using SafeMath for uint256;

    event Epoch(uint256 epoch);
    event ValidatorJoin(address indexed signerAddr, uint256 epoch);
    event ValidatorLeave(address indexed signerAddr, uint256 epoch);
    
    uint256 epochLength;
    uint256 currentEpoch;
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
    
    constructor(ERC20 _token, uint256 _slotCount) public {
        require(_slotCount < 256);
        require(_slotCount >= 4);
        epochLength = _slotCount;
        require(_token != address(0));
        token = _token;
    }

    function getSlot(uint256 _slotId) constant public returns (address, uint64, address, uint32, address, uint64, address) {
        require(_slotId < epochLength);
        Slot memory slot = slots[_slotId];
        return (slot.owner, slot.stake, slot.signer, slot.activationEpoch, slot.newOwner, slot. newStake, slot.newSigner);
    }
    
    function buy(uint256 _slotId, uint256 _value, address _signerAddr) public {
        require(_slotId < epochLength);
        Slot storage slot = slots[_slotId];
        // take care of logout
        if (_value == 0 && slot.newStake == 0 && slot.signer == _signerAddr) {
            slot.activationEpoch = uint32(currentEpoch.add(2));
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
            slot.activationEpoch = uint32(currentEpoch.add(2));
        }
        // new purchase
        else {
            slot.owner = msg.sender;
            slot.signer = _signerAddr;
            slot.stake = uint64(_value);
            slot.activationEpoch = 0;
        }
    }
    
    function activate(uint256 _slotId) public {
        require(_slotId < epochLength);
        Slot storage slot = slots[_slotId];
        require(currentEpoch >= slot.activationEpoch);
        if (slot.stake > 0) {
            token.transfer(slot.owner, slot.stake);
            emit ValidatorLeave(slot.signer, currentEpoch);
        }
        slot.owner = slot.newOwner;
        slot.signer = slot.newSigner;
        slot.stake = slot.newStake;
        slot.activationEpoch = 0;
        slot.newOwner = 0;
        slot.newSigner = 0;
        slot.newStake = 0;
        emit ValidatorJoin(slot.signer, currentEpoch);
    }
    
    function submitBlock(uint256 _slotId, address _signer) public {
        require(_slotId < epochLength);
        Slot storage slot = slots[_slotId];
        require(slot.signer == _signer);
        if (slot.activationEpoch > 0) {
            // if slot not active, prevent submission
            require(currentEpoch.add(1) < slot.activationEpoch);
        }
        epochLength = epochLength;
    }
    
    function incrementEpoch() public {
        currentEpoch = currentEpoch.add(1);
        emit Epoch(currentEpoch);
    }
    
    function slash(uint256 _slotId, uint256 _value) public {
        require(_slotId < epochLength);
        Slot storage slot = slots[_slotId];
        require(slot.stake > 0);
        uint256 prevStake = slot.stake;
        slot.stake = (_value >= slot.stake) ? 0 : slot.stake - uint64(_value);
        // if slot became empty by slashing
        if (prevStake > 0 && slot.stake == 0) {
            emit ValidatorLeave(slot.signer, currentEpoch);
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