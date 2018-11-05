
/**
 * Copyright (c) 2017-present, Parsec Labs (parseclabs.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/math/Math.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

import "./TransferrableToken.sol";
import "./PriorityQueue.sol";
import "./TxLib.sol";
import "./IntrospectionUtil.sol";


contract ParsecBridge is Ownable {
// solium-disable security/no-block-members 

  using SafeMath for uint256;
  using TxLib for TxLib.Outpoint;
  using TxLib for TxLib.Output;
  using TxLib for TxLib.Tx;
  using TxLib for TxLib.TxType;
  using PriorityQueue for PriorityQueue.Token;

  event Epoch(uint256 epoch);
  event EpochLength(uint256 epochLength);
  event NewHeight(uint256 blockNumber, bytes32 indexed root);
  event NewDeposit(uint32 indexed depositId, address indexed depositor, uint256 indexed color, uint256 amount);
  
  event ExitStarted(
    bytes32 indexed txHash, 
    uint256 indexed outIndex, 
    uint256 indexed color, 
    address exitor, 
    uint256 amount
  );
  
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
  
  event NewToken(address indexed tokenAddr, uint16 color);

  // "I am very angry, but it was fun!" @victor
  bytes32 public constant GENESIS = 0x4920616d207665727920616e6772792c20627574206974207761732066756e21; 

  uint256 public epochLength; // length of epoch in periods (32 blocks)
  uint256 public lastCompleteEpoch; // height at which last epoch was completed
  uint256 public lastEpochBlockHeight;
  uint256 public parentBlockInterval; // how often epochs can be submitted max
  uint64 public lastParentBlock; // last ethereum block when epoch was submitted
  uint256 public maxReward; // max reward per period
  uint256 public averageGasPrice; // collected gas price for last submitted blocks
  uint256 public exitDuration;
  bytes32 public tipHash; // hash of first period that has extended chain to some height
  uint256 public exitStake; // amount of token[0] needed fort staking on exits

  mapping(uint16 => PriorityQueue.Token) public tokens;
  mapping(address => bool) public tokenColors;
  uint16 public erc20TokenCount = 0;
  uint16 public nftTokenCount = 0;

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

  mapping(uint256 => Slot) public slots;

  struct Period {
    bytes32 parent; // the id of the parent node
    uint32 height;  // the height of last block in period
    uint32 parentIndex; //  the position of this node in the Parent's children list
    uint8 slot;
    uint32 timestamp;
    uint64 reward;
    bytes32[] children; // unordered list of children below this node
  }

  mapping(bytes32 => Period) public periods;

  struct Deposit {
    uint64 height;
    uint16 color;
    address owner;
    uint256 amount;
  }

  mapping(uint32 => Deposit) public deposits;
  
  uint32 public depositCount = 0;

  struct Exit {
    uint256 amount;
    uint16 color;
    address owner;
    bool finalized;
    uint256 stake;
  }

  struct NftExit {
    bytes32 utxoId;
    uint256 exitableAt;
  }

  /**
   * UTXO → Exit mapping. Contains exits for both NFT and ERC20 colors
   */
  mapping(bytes32 => Exit) public exits;

  /**
   * color → NftExit[] mapping. Contains (UTXO+exitable date) for NFT exits
   */
  mapping(uint16 => NftExit[]) public nftExits;
  
  constructor(
    uint256 _epochLength, 
    uint256 _maxReward, 
    uint256 _parentBlockInterval, 
    uint256 _exitDuration,
    uint256 _exitStake
  ) public {
    // init genesis preiod
    Period memory genesisPeriod;
    genesisPeriod.parent = GENESIS;
    genesisPeriod.height = 32;
    genesisPeriod.timestamp = uint32(block.timestamp);
    tipHash = GENESIS;
    periods[tipHash] = genesisPeriod;
    // epochLength and at the same time number of validator slots
    require(_epochLength < 256);
    require(_epochLength >= 2);
    epochLength = _epochLength;
    // full period reward before taxes and adjustments
    maxReward = _maxReward;
    // parent block settings
    parentBlockInterval = _parentBlockInterval;
    lastParentBlock = uint64(block.number);
    exitDuration = _exitDuration;
    exitStake = _exitStake;

    emit EpochLength(epochLength);
  }

  function setExitStake(uint256 _exitStake) public onlyOwner {
    exitStake = _exitStake;
  }

  function setEpochLength(uint256 _epochLength) public onlyOwner {
    epochLength = _epochLength;
  }

  function tokenCount() public view returns (uint256) {
    return erc20TokenCount + nftTokenCount;
  }

  function registerToken(TransferrableToken _token) public onlyOwner {
    require(_token != address(0));
    require(!tokenColors[_token]);
    uint16 color;
    if (IntrospectionUtil.isERC721(_token)) {
      color = 32769 + nftTokenCount; // NFT color namespace starts from 2^15 + 1
      nftTokenCount += 1;
    } else {
      color = erc20TokenCount;
      erc20TokenCount += 1;
    }
    uint256[] memory arr = new uint256[](1);
    tokenColors[_token] = true;
    tokens[color] = PriorityQueue.Token({
      addr: _token,
      heapList: arr,
      currentSize: 0
    });
    emit NewToken(_token, color);
  }

  function getSlot(
    uint256 _slotId
  ) public view returns (
    uint32, address, uint64, address, bytes32, uint32, address, uint64, address, bytes32
  ) {
    require(_slotId < epochLength);
    Slot memory slot = slots[_slotId];
    return (
      slot.eventCounter, slot.owner, slot.stake, slot.signer, slot.tendermint,
      slot.activationEpoch, slot.newOwner, slot.newStake, slot.newSigner, slot.newTendermint
    );
  }

  function getTip() public view returns (bytes32, uint256) {
    // find consensus horizon
    bytes32 consensusHorizon = periods[tipHash].parent;
    uint256 depth = (periods[tipHash].height < epochLength * 32) ? 1 : periods[tipHash].height - (epochLength * 32);
    depth += 32;
    while (periods[consensusHorizon].height > depth) {
      consensusHorizon = periods[consensusHorizon].parent;
    }
    // create data structure for depth first search
    bytes32[] memory data = new bytes32[](epochLength + 2);
    // run search
    bytes32[] memory rsp = dfs(data, consensusHorizon);
    // return result
    return (rsp[0], uint256(rsp[1]) >> 128);
  }

  // solium-disable security/no-tx-origin
  // TODO: consider not to use tx.origin
  function bet(
    uint256 _slotId, 
    uint256 _value, 
    address _signerAddr, 
    bytes32 _tenderAddr
  ) public {
    require(_slotId < epochLength);
    Slot storage slot = slots[_slotId];
    // take care of logout
    if (_value == 0 && slot.newStake == 0 && slot.signer == _signerAddr) {
      require(slot.owner == tx.origin);
      slot.activationEpoch = uint32(lastCompleteEpoch.add(3));
      slot.eventCounter++;
      emit ValidatorLogout(
        slot.signer, 
        _slotId, 
        _tenderAddr,
        0x0, 
        slot.eventCounter, 
        lastCompleteEpoch + 3
      );
      return;
    }
    // check min stake
    uint required = slot.stake;
    if (slot.newStake > required) {
      required = slot.newStake;
    }
    required = required.mul(105).div(100);
    require(required < _value);

    // new purchase or update
    if (slot.stake == 0 || (slot.owner == tx.origin && slot.newStake == 0)) {
      uint64 stake = slot.stake;
      tokens[0].addr.transferFrom(tx.origin, this, _value - slot.stake);
      slot.owner = tx.origin;
      slot.signer = _signerAddr;
      slot.tendermint = _tenderAddr;
      slot.stake = uint64(_value);
      slot.activationEpoch = 0;
      slot.eventCounter++;
      if (stake == 0) {
        emit ValidatorJoin(
          slot.signer, 
          _slotId, 
          _tenderAddr, 
          slot.eventCounter, 
          lastCompleteEpoch + 1
        );
      } else {
        emit ValidatorUpdate(
          slot.signer, 
          _slotId, 
          _tenderAddr, 
          slot.eventCounter
        );
      }
    } else { // auction
      if (slot.newStake > 0) {
        ERC20(tokens[0].addr).transfer(slot.newOwner, slot.newStake);
      }
      tokens[0].addr.transferFrom(tx.origin, this, _value);
      slot.newOwner = tx.origin;
      slot.newSigner = _signerAddr;
      slot.newTendermint = _tenderAddr;
      slot.newStake = uint64(_value);
      slot.activationEpoch = uint32(lastCompleteEpoch.add(3));
      slot.eventCounter++;
      emit ValidatorLogout(
        slot.signer, 
        _slotId, 
        _tenderAddr, 
        _signerAddr, 
        slot.eventCounter, 
        lastCompleteEpoch + 3
      );
    }
  }
  // solium-enable security/no-tx-origin

  function activate(uint256 _slotId) public {
    require(_slotId < epochLength);
    Slot storage slot = slots[_slotId];
    require(lastCompleteEpoch + 1 >= slot.activationEpoch);
    if (slot.stake > 0) {
      ERC20(tokens[0].addr).transfer(slot.owner, slot.stake);
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
    slot.stake = slot.newStake;
    slot.activationEpoch = 0;
    slot.newOwner = 0;
    slot.newSigner = 0;
    slot.newTendermint = 0x0;
    slot.newStake = 0;
    slot.eventCounter++;
    if (slot.stake > 0) {
      emit ValidatorJoin(
        slot.signer, 
        _slotId, 
        slot.tendermint, 
        slot.eventCounter, 
        lastCompleteEpoch + 1
      );
    }
  }

  function submitPeriod(uint256 _slotId, bytes32 _prevHash, bytes32 _root) public {
    require(periods[_prevHash].parent > 0, "Parent node should exist");
    require(periods[_root].height == 0, "Given root shouldn't be submitted yet");
    require(_slotId < epochLength, "Incorrect slotId");
    Slot storage slot = slots[_slotId];
    require(slot.signer == msg.sender);
    if (slot.activationEpoch > 0) {
      // if slot not active, prevent submission
      require(lastCompleteEpoch.add(2) < slot.activationEpoch);
    }

    // calculate height
    uint256 newHeight = periods[_prevHash].height + 32;
    // do some magic if chain extended
    if (newHeight > periods[tipHash].height) {
      // new periods can only be submitted every x Ethereum blocks
      require(block.number >= lastParentBlock + parentBlockInterval);
      tipHash = _root;
      lastParentBlock = uint64(block.number);
      // record gas
      recordGas();
      emit NewHeight(newHeight, _root);
    }
    // store the period
    Period memory newPeriod;
    newPeriod.parent = _prevHash;
    newPeriod.height = uint32(newHeight);
    newPeriod.slot = uint8(_slotId);
    newPeriod.timestamp = uint32(block.timestamp);
    newPeriod.parentIndex = uint32(periods[_prevHash].children.push(_root) - 1);
    periods[_root] = newPeriod;

    // distribute rewards
    uint256 totalSupply = ERC20(tokens[0].addr).totalSupply();
    uint256 stakedSupply = ERC20(tokens[0].addr).balanceOf(this);
    uint256 reward = maxReward;
    if (stakedSupply >= totalSupply.div(2)) {
      // 4 x br x as x (ts - as)
      // -----------------------
      //        ts x ts
      reward = totalSupply.sub(stakedSupply).mul(stakedSupply).mul(maxReward).mul(4).div(totalSupply.mul(totalSupply));
    }
    slot.stake += uint64(reward);

    // check if epoch completed
    if (newHeight >= lastEpochBlockHeight.add(epochLength.mul(32))) {
      lastCompleteEpoch++;
      lastEpochBlockHeight = newHeight;
      emit Epoch(lastCompleteEpoch);
    }
  }

    /*
   * _txData = [ 32b periodHash, (1b Proofoffset, 8b pos,  ..00.., 1b txData), 32b txData, 32b proof, 32b proof ]
   *
   * # 2 Deposit TX (33b)
   *   1b type
   *     4b depositId
   *     8b value, 2b color, 20b address
   *
   */
  function reportInvalidDeposit(bytes32[] _txData) public {
    Period memory p = periods[_txData[0]];
    if (periods[tipHash].height > epochLength) {
      require(p.height > periods[tipHash].height - epochLength);
    }
    // check transaction proof
    bytes memory txData;
    (, , txData) = TxLib.validateProof(0, _txData);

    TxLib.Tx memory txn = TxLib.parseTx(txData);

    Deposit memory dep = deposits[uint32(txn.ins[0].outpoint.hash)];
    require(txn.outs[0].value != dep.amount || txn.outs[0].owner != dep.owner);

    // delete invalid period
    deletePeriod(_txData[0]);
    // EVENT
    // slash operator
    slash(p.slot, 10 * maxReward);
    // reward 1 block reward
    ERC20(tokens[0].addr).transfer(msg.sender, maxReward);
  }

  function reportDoubleSpend(bytes32[] _proof, bytes32[] _prevProof) public {
    Period memory p = periods[_proof[0]];

    // validate proofs
    uint256 offset = 32 * (_proof.length + 2);
    uint64 txPos1;
    (txPos1, , ) = TxLib.validateProof(offset, _prevProof);

    uint64 txPos2;
    (txPos2, , ) = TxLib.validateProof(32, _proof);

    // make sure transactions are different
    require(_proof[0] != _prevProof[0] || txPos1 != txPos2);

    // get iputs and validate
    bytes32 prevHash1;
    bytes32 prevHash2;
    uint8 outPos1;
    uint8 outPos2;
    assembly {
      //TODO: allow other than first inputId
      prevHash1 := calldataload(add(134, 32))
      outPos1 := calldataload(add(166, 32))
      prevHash2 := calldataload(add(134, offset))
      outPos2 := calldataload(add(166, offset))
    }

    // check that spending same outputs
    require(prevHash1 == prevHash2 && outPos1 == outPos2);
    // delete invalid period
    deletePeriod(_proof[0]);
    // EVENT
    // slash operator
    slash(p.slot, 50);
  }

  /**
   * @notice Add to the network `(_amountOrTokenId)` amount of a `(_color)` tokens
   * or `(_amountOrTokenId)` token id if `(_color)` is NFT.
   * @dev Token should be registered with the Bridge first.
   * @param _owner Account to transfer tokens from
   * @param _amountOrTokenId Amount (for ERC20) or token ID (for ERC721) to transfer
   * @param _color Color of the token to deposit
   */
  function deposit(address _owner, uint256 _amountOrTokenId, uint16 _color) public {
    require(tokens[_color].addr != address(0));
    tokens[_color].addr.transferFrom(_owner, this, _amountOrTokenId);
    depositCount++;
    deposits[depositCount] = Deposit({
      height: periods[tipHash].height,
      owner: _owner,
      color: _color,
      amount: _amountOrTokenId
    });
    emit NewDeposit(
      depositCount, 
      _owner, 
      _color, 
      _amountOrTokenId
    );
  }

  function startExit(bytes32[] _proof, uint256 _oindex) public returns (bytes32 utxoId) {
    // root was submitted as period
    require(periods[_proof[0]].parent > 0);
    // validate proof
    bytes32 txHash;
    bytes memory txData;
    (, txHash, txData) = TxLib.validateProof(32, _proof);
    // parse tx and use data
    TxLib.Output memory out = TxLib.parseTx(txData).outs[_oindex];

    require(out.owner == msg.sender, "Only UTXO owner can start exit");
    uint256 exitableAt = Math.max256(periods[_proof[0]].timestamp + (2 * exitDuration), block.timestamp + exitDuration);
    utxoId = bytes32((_oindex << 120) | uint120(txHash));
    uint256 priority = (exitableAt << 128) | uint128(utxoId);
    require(out.value > 0);
    require(exits[utxoId].amount == 0);
    if (isNft(out.color)) {
      nftExits[out.color].push(NftExit({ utxoId: utxoId, exitableAt: exitableAt }));
    } else {
      tokens[0].addr.transferFrom(out.owner, this, exitStake);
      tokens[out.color].insert(priority);
    }

    exits[utxoId] = Exit({
      owner: out.owner,
      color: out.color,
      amount: out.value,
      finalized: false,
      stake: exitStake
    });
    emit ExitStarted(
      txHash, 
      _oindex, 
      out.color, 
      out.owner, 
      out.value
    );
  }

  function startBoughtExit(bytes32[] _proof, uint256 _oindex, bytes32[] signedData) public {

    // root was submitted as period, check bridge was reciever
    require(periods[_proof[0]].parent > 0);

    // validate proof
    bytes32 txHash;
    bytes memory txData;
    (, txHash, txData) = TxLib.validateProof(64, _proof);
    // parse tx and use data
    TxLib.Tx memory txn = TxLib.parseTx(txData);
    TxLib.Output memory out = txn.outs[_oindex];
    (uint256 buyPrice, bytes32 utxoIdSigned, address signer) = unpackSignedData(signedData);

    require(out.owner == address(this), "Funds were not sent to bridge");
    require(ecrecover(TxLib.getSigHash(txData), txn.ins[0].v, txn.ins[0].r, txn.ins[0].s) == signer, "Exit was not signed by owner");

    uint256 exitableAt = Math.max256(periods[_proof[0]].timestamp + (2 * exitDuration), block.timestamp + exitDuration);

    require(bytes32((_oindex << 120) | uint120(txHash)) == utxoIdSigned, "The signed utxoid does not match the one in the proof");

    uint256 priority = (exitableAt << 128) | uint128(utxoIdSigned);
    require(out.value > 0);
    require(exits[utxoIdSigned].amount == 0);
    require(!isNft(out.color), "Tried to call with NFT");
    tokens[0].addr.transferFrom(msg.sender, this, exitStake);
    tokens[out.color].insert(priority);

    // pay the seller
    tokens[out.color].addr.transferFrom(msg.sender, signer, buyPrice);

    // give exit to buyer
    exits[utxoIdSigned] = Exit({
      owner: msg.sender,
      color: out.color,
      amount: out.value,
      finalized: false,
      stake: exitStake
    });
    emit ExitStarted(
      txHash, 
      _oindex, 
      out.color, 
      out.owner, 
      out.value
    );
  }

  function unpackSignedData(bytes32[] signedData) internal pure returns (uint256 buyPrice, bytes32 utxoId, address signer) {
    bytes32[] memory sigBuff = new bytes32[](2);
    utxoId = signedData[0];
    buyPrice = uint256(signedData[1]);
    bytes32 r = signedData[2];
    bytes32 s = signedData[3];
    uint8 v = uint8(signedData[4]);
    sigBuff[0] = utxoId;
    sigBuff[1] = signedData[1];
    bytes32 sigHash = keccak256(sigBuff);
    signer = ecrecover(sigHash, v, r, s);
  }

  function challengeExit(
    bytes32[] _proof, 
    bytes32[] _prevProof, 
    uint256 _oIndex, 
    uint256 _inputIndex
  ) public {
    // validate exiting tx
    uint256 offset = 32 * (_proof.length + 2);
    bytes32 txHash1;
    (, txHash1, ) = TxLib.validateProof(offset + 64, _prevProof);
    bytes32 utxoId = bytes32((_oIndex << 120) | uint120(txHash1));

    require(exits[utxoId].amount > 0);

    // validate spending tx
    bytes memory txData;
    (, , txData) = TxLib.validateProof(96, _proof);
    TxLib.Tx memory txn = TxLib.parseTx(txData);

    // make sure one is spending the other one
    require(txHash1 == txn.ins[_inputIndex].outpoint.hash);
    require(_oIndex == txn.ins[_inputIndex].outpoint.pos);

    // if transfer, make sure signature correct
    if (txn.txType == TxLib.TxType.Transfer) {
      bytes32 sigHash = TxLib.getSigHash(txData);
      address signer = ecrecover(
        sigHash, 
        txn.ins[_inputIndex].v, 
        txn.ins[_inputIndex].r, 
        txn.ins[_inputIndex].s
      );
      require(exits[utxoId].owner == signer);
    }

    // award stake to challanger
    ERC20(tokens[0].addr).transfer(msg.sender, exits[utxoId].stake);
    // delete invalid exit
    delete exits[utxoId];
  }

  // @dev Loops through the priority queue of exits, settling the ones whose challenge
  // @dev challenge period has ended
  function finalizeExits(uint16 _color) public {
    if (isNft(_color)) {
      return finalizeNFTExits(_color);
    }
    bytes32 utxoId;
    uint256 exitableAt;
    (utxoId, exitableAt) = getNextExit(_color);

    Exit memory currentExit = exits[utxoId];
    while (exitableAt <= block.timestamp && tokens[currentExit.color].currentSize > 0) {
      currentExit = exits[utxoId];
      if (currentExit.owner != 0 || currentExit.amount != 0) { // exit was removed
        ERC20(tokens[currentExit.color].addr).transfer(currentExit.owner, currentExit.amount);
        ERC20(tokens[0].addr).transfer(currentExit.owner, currentExit.stake);
      }
      tokens[currentExit.color].delMin();

      exits[utxoId].finalized = true;

      if (tokens[currentExit.color].currentSize > 0) {
        (utxoId, exitableAt) = getNextExit(_color);
      } else {
        return;
      }
    }
  }

  function getNextExit(uint16 _color) internal view returns (bytes32 utxoId, uint256 exitableAt) {
    uint256 priority = tokens[_color].getMin();
    utxoId = bytes32(uint128(priority));
    exitableAt = priority >> 128;
  }

  function isNft(uint16 _color) internal pure returns (bool) {
    return _color > 32768; // 2^15
  }

  function finalizeNFTExits(uint16 _color) internal {
    NftExit[] memory colorExitUtxos = nftExits[_color];
    uint256 i = 0;
    bytes32 utxoId = colorExitUtxos[0].utxoId;
    uint256 exitableAt = colorExitUtxos[0].exitableAt;
    while (exitableAt <= block.timestamp) {
      if (utxoId != 0) {
        Exit memory currentExit = exits[utxoId];
        if (currentExit.owner != 0 || currentExit.amount != 0) {
          tokens[currentExit.color].addr.transferFrom(
            address(this),
            currentExit.owner,
            currentExit.amount
          );
        }
        delete exits[utxoId];
        delete nftExits[_color][i];
      }
      i += 1;
      if (i >= colorExitUtxos.length) {
        return;
      }
      utxoId = colorExitUtxos[i].utxoId;
      exitableAt = colorExitUtxos[i].exitableAt;
    }
  }

  function deletePeriod(bytes32 hash) internal {
    Period storage parent = periods[periods[hash].parent];
    uint256 i = periods[hash].parentIndex;
    if (i < parent.children.length - 1) {
      // swap with last child
      parent.children[i] = parent.children[parent.children.length - 1];
    }
    parent.children.length--;
    if (hash == tipHash) {
      tipHash = periods[hash].parent;
    }
    delete periods[hash];
  }

  function slash(uint256 _slotId, uint256 _value) internal {
    require(_slotId < epochLength);
    Slot storage slot = slots[_slotId];
    require(slot.stake > 0);
    uint256 prevStake = slot.stake;
    slot.stake = (_value >= slot.stake) ? 0 : slot.stake - uint64(_value);
    // if slot became empty by slashing
    if (prevStake > 0 && slot.stake == 0) {
      emit ValidatorLeave(
        slot.signer, 
        _slotId, 
        slot.tendermint, 
        lastCompleteEpoch + 1
      );
      slot.activationEpoch = 0;
      if (slot.newStake > 0) {
        // someone in queue
        activate(_slotId);
      } else {
        // clean out account
        slot.owner = 0;
        slot.signer = 0;
        slot.tendermint = 0x0;
        slot.stake = 0;
      }
    }
  }

  function recordGas() internal {
    averageGasPrice = averageGasPrice - (averageGasPrice / 15) + (tx.gasprice / 15);
  }

  // data = [winnerHash, claimCountTotal, operator, operator ...]
  // operator: 1b claimCountByOperator - 10b 0x - 1b stake - 20b address
  function dfs(bytes32[] _data, bytes32 _nodeHash) internal view returns(bytes32[] data) {
    Period memory node = periods[_nodeHash];
    // visit this node
    data = new bytes32[](_data.length);
    for (uint256 i = 1; i < _data.length; i++) {
      data[i] = _data[i];
    }
    // find the operator that mined this block
    i = node.slot + 2;
    // if operator can claim rewards, assign
    if (uint256(data[i]) == 0) {
      data[i] = bytes32(1);
      data[1] = bytes32(uint256(data[1]) + (1 << 128));
      data[0] = _nodeHash;
    }
    // more of tree to walk
    if (node.children.length > 0) {
      bytes32[][] memory options = new bytes32[][](data.length);
      for (i = 0; i < node.children.length; i++) {
        options[i] = dfs(data, node.children[i]);
      }
      for (i = 0; i < node.children.length; i++) {
        // compare options, return the best
        if (uint256(options[i][1]) > uint256(data[1])) {
          data[0] = options[i][0];
          data[1] = options[i][1];
        }
      }
    } else {
      data[0] = _nodeHash;
      data[1] = bytes32(uint256(data[1]) + 1);
    }
    // else - reached a tip
    // return data
  }

}
// solium-enable security/no-block-members
