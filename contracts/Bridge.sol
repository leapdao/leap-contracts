
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

import "./MintableToken.sol";
import "./PriorityQueue.sol";
import "./TransferrableToken.sol";
import "./IntrospectionUtil.sol";

contract Bridge is Ownable {

  using SafeMath for uint256;
  using PriorityQueue for PriorityQueue.Token;

  modifier onlyOperator() {
    require(msg.sender == operator, "Tried to call a only-operator function from non-operator");
    _;
  }

  event NewHeight(uint256 height, bytes32 indexed root);
  event NewOperator(address operator);
  event NewToken(address indexed tokenAddr, uint16 color);
  event NewDeposit(
    uint32 indexed depositId, 
    address indexed depositor, 
    uint256 indexed color, 
    uint256 amount
  );


  struct Period {
    bytes32 parent; // the id of the parent node
    uint32 height;  // the height of last block in period
    uint32 parentIndex; //  the position of this node in the Parent's children list
    uint32 timestamp;
    bytes32[] children; // unordered list of children below this node
  }

  struct Deposit {
    uint64 height;
    uint16 color;
    address owner;
    uint256 amount;
  }

  bytes32 public constant GENESIS = 0x4920616d207665727920616e6772792c20627574206974207761732066756e21;

  bytes32 public tipHash; // hash of first period that has extended chain to some height
  uint256 public parentBlockInterval; // how often epochs can be submitted max
  uint64 public lastParentBlock; // last ethereum block when epoch was submitted
  address public operator; // the operator of the plasma chain (can be a contract)
  uint256 public maxReward; // max reward per period
  MintableToken public nativeToken; // plasma native token

  uint16 public erc20TokenCount = 0;
  uint16 public nftTokenCount = 0;
  uint32 public depositCount = 0;

  mapping(bytes32 => Period) public periods;
  mapping(uint16 => PriorityQueue.Token) public tokens;
  mapping(address => bool) public tokenColors;
  mapping(uint32 => Deposit) public deposits;

  constructor(
    uint256 _parentBlockInterval,
    uint256 _maxReward,
    MintableToken _nativeToken
  ) public {
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

    parentBlockInterval = _parentBlockInterval;
    lastParentBlock = uint64(block.number);
    maxReward = _maxReward;

    nativeToken = _nativeToken;
    nativeToken.init(address(this));
    registerToken(TransferrableToken(_nativeToken));
  }

  function setOperator(address _operator) public onlyOwner {
    operator = _operator;
    emit NewOperator(_operator);
  }

  function registerToken(TransferrableToken _token) public onlyOwner {
    // make sure token is not 0x0 and that it has not been registered yet
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

  function submitPeriod(bytes32 _prevHash, bytes32 _root) public onlyOperator {

    require(periods[_prevHash].parent > 0, "Parent node should exist");
    require(periods[_root].height == 0, "Given root shouldn't be submitted yet");

    // calculate height
    uint256 newHeight = periods[_prevHash].height + 1;
    // do some magic if chain extended
    if (newHeight > periods[tipHash].height) {
      // new periods can only be submitted every x Ethereum blocks
      require(block.number >= lastParentBlock + parentBlockInterval, 
        "Tried to submit new period too soon");
      tipHash = _root;
      lastParentBlock = uint64(block.number);
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

    // distribute rewards
    uint256 totalSupply = nativeToken.totalSupply();
    uint256 stakedSupply = nativeToken.balanceOf(operator);
    uint256 reward = maxReward;
    if (stakedSupply >= totalSupply.div(2)) {
      // 4 x br x as x (ts - as)
      // -----------------------
      //        ts x ts
      reward = totalSupply.sub(stakedSupply).mul(stakedSupply).mul(maxReward).mul(4).div(totalSupply.mul(totalSupply));
    }
    nativeToken.mint(operator, reward);
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
    deposits[depositCount] = Deposit({
      height: periods[tipHash].height,
      owner: _owner,
      color: _color,
      amount: _amountOrTokenId
    });
    depositCount++;
    emit NewDeposit(
      depositCount, 
      _owner, 
      _color, 
      _amountOrTokenId
    );
  }  
  
}