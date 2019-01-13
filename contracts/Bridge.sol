
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./Adminable.sol";

contract Bridge is Adminable {
  using SafeMath for uint256;

  modifier onlyOperator() {
    require(msg.sender == operator, "Tried to call a only-operator function from non-operator");
    _;
  }

  event NewHeight(uint256 height, bytes32 indexed root);
  event NewOperator(address operator);

  struct Period {
    bytes32 parent; // the id of the parent node
    uint32 height;  // the height of last block in period
    uint32 parentIndex; //  the position of this node in the Parent's children list
    uint32 timestamp;
    bytes32[] children; // unordered list of children below this node
  }

  bytes32 constant GENESIS = 0x4920616d207665727920616e6772792c20627574206974207761732066756e21;

  bytes32 public tipHash; // hash of first period that has extended chain to some height
  uint256 public genesisBlockNumber;
  uint256 parentBlockInterval; // how often epochs can be submitted max
  uint256 public lastParentBlock; // last ethereum block when epoch was submitted
  address public operator; // the operator contract

  mapping(bytes32 => Period) public periods;

  function initialize(uint256 _parentBlockInterval) public initializer {
    // init genesis preiod
    Period memory genesisPeriod = Period({
      parent: GENESIS,
      height: 1,
      timestamp: uint32(block.timestamp),
      parentIndex: 0,
      children: new bytes32[](0)
    });
    tipHash = GENESIS;
    periods[tipHash] = genesisPeriod;
    genesisBlockNumber = block.number;
    parentBlockInterval = _parentBlockInterval;
    operator = msg.sender;
  }

  function setOperator(address _operator) public ifAdmin {
    operator = _operator;
    emit NewOperator(_operator);
  }

  function getParentBlockInterval() public view returns (uint256) {
    return parentBlockInterval;
  }

  function setParentBlockInterval(uint256 _parentBlockInterval) public ifAdmin {
    parentBlockInterval = _parentBlockInterval;
  }

  function submitPeriod(
    bytes32 _prevHash, 
    bytes32 _root) 
  public onlyOperator returns (uint256 newHeight) {

    require(periods[_prevHash].parent > 0, "Parent node should exist");
    require(periods[_root].height == 0, "Given root shouldn't be submitted yet");

    // calculate height
    newHeight = periods[_prevHash].height + 1;
    // do some magic if chain extended
    if (newHeight > periods[tipHash].height) {
      // new periods can only be submitted every x Ethereum blocks
      require(
        block.number >= lastParentBlock + parentBlockInterval, 
        "Tried to submit new period too soon"
      );
      tipHash = _root;
      lastParentBlock = block.number;
      emit NewHeight(newHeight, _root);
    }
    // store the period
    Period memory newPeriod = Period({
      parent: _prevHash,
      height: uint32(newHeight),
      timestamp: uint32(block.timestamp),
      parentIndex: uint32(periods[_prevHash].children.push(_root) - 1),
      children: new bytes32[](0)
    });
    periods[_root] = newPeriod;
  }
}