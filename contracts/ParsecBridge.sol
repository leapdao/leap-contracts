pragma solidity ^0.4.19;

import "zeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "zeppelin-solidity/contracts/math/SafeMath.sol";

contract ParsecBridge {
  using SafeMath for uint256;
  
  /*
   *  an epoch describes a sections in block height. 
   *
   *       genesis/archive epoch             payout epoch                consensus window
   *                ↓                             ↓                              ↓               
   *    0*EL ->    ...    -> 1*EL-1   2*EL ->    ...    -> 3*EL-1    3*EL ->    ...    -> 4*EL-x 
   *  |-----------------------------|------------------------------|-----------------------------
   *  |                             |                              |
   *  |                             |                              |      /-> b[3*EL+y]
   *  | l[0] ->  ...  -> l[1*EL-1] -> b[2*EL] -> ... -> b[3*EL-1] -> b[3*EL] ->  ...    -> b[4*EL-x]
   *  |                             |                              |               \-> b[3*EL+z]
   *  |                             |                              |
   *  |-----------------------------|------------------------------|-----------------------------
   *  EL = epoch-length, l[height] = logEntry, b[height] = block, 0 < x/y/z < EL
   *
   * Consensus Window: This is a sliding window with the size of epoch-length blocks spanning back
   * ---------------- from the chain tip. Blocks in this window can be challenged and invalidated.
   *                  In this window the tree can branch, and competing branches can be clipped.
   *                  Blocks can be submitted at chain-height or height + 1. The block submission
   *                  prunes all branches at (height - epoch-length), leving only a trunk of blocks
   *                  on the valid chain in storage after the consensus window.
   * 
   * Payout Epoch: This epoch starts at a distance of x * EL from the genesis block. It is the youngest 
   * ------------ epoch that has more than epoch-length distance from the tip. Hence, it contains 
   *              a trunk of epoch-length blocks. Operators claim rewards from blocks in the payout
   *              epoch. The blocks in the payout epoch are on the longest chain and final, determined
   *              by pruning and clipping during the consensus window.
   *
   * Archive Epochs: These epochs also start at distances of x * EL from the genesis block and span
   * -------------- until the payout epoch. In these epochs the block data is not needed any more.
   *                Blocks are archived by deletion and replaced by log-entlies of block-hash and height.
   */
  
  bytes32 constant genesis = 0x4920616d207665727920616e6772792c20627574206974207761732066756e21; // "I am very angry, but it was fun!" @victor
  ERC20 public token;

  event NewHeight(uint256 blockNumber, bytes32 indexed root);
  event ArchiveBlock(uint256 indexed blockNumber, bytes32 root);
  event OperatorJoin(address indexed signerAddr, uint256 blockNumber);
  event OperatorLeave(address indexed signerAddr, uint256 blockNumber);

  struct Block {
    bytes32 parent; // the id of the parent node
    uint64 height;  // the hight this block is stored at
    uint32 parentIndex; //  the position of this node in the Parent's children list
    address operator; // the operator that submitted the block
    bytes32[] children; // unordered list of children below this node
    // more node attributes here
  }
  mapping(bytes32 => Block) public chain;

  uint32 public parentBlockInterval; // how often plasma blocks can be submitted max
  uint64 public lastParentBlock; // last ethereum block when plasma block submitted
  bytes32 public tipHash;    // hash of first block that has extended chain to some hight
  uint32 public operatorCount; // number of staked operators
  uint32 public epochLength; // length of 1 epoche in child blocks

  struct Operator {
    // joinedAt is unix timestamp while operator active.
    // once operator requested leave joinedAt set to block height when requested exit
    uint64 joinedAt; 
    uint64 claimedUntil; // the epoche until which all reward claims have been processed
    uint256 stakeAmount; // amount of staken tokens
  }
  mapping(address => Operator) public operators;


  function ParsecBridge(ERC20 _token, uint32 _parentBlockInterval, uint32 _epochLength) public {
    require(_token != address(0));
    token = _token;
    Block memory genBlock;
    genBlock.parent = genesis; 
    tipHash = keccak256(genesis, uint64(0), bytes32(0));
    chain[tipHash] = genBlock;
    parentBlockInterval = _parentBlockInterval;
    epochLength = _epochLength;
    lastParentBlock = uint64(block.number);
  }
  
  /*
   *  Modifiers
   */
  modifier isOperator() {
    require(operators[msg.sender].stakeAmount > 0);
    _;
  }
  
  modifier mint() {
    // todo: mine some tokens, if needed
    _;
  }

  /*
   * Add an operator
   */
  function join(uint256 amount) public {
    require(operators[msg.sender].stakeAmount + amount <= token.totalSupply().div(epochLength).mul(5));
    require(token.allowance(msg.sender, this) >= amount);
    require(operatorCount < epochLength);

    token.transferFrom(msg.sender, this, amount);
    operatorCount++;
    
    operators[msg.sender] = Operator({
      joinedAt: uint32(now),
      claimedUntil: (chain[tipHash].height & 0xffffffffffffff40), // most recent epoche
      stakeAmount: amount
    });
    OperatorJoin(msg.sender, chain[tipHash].height);
  }

  /*
   * operator submits coinbase with prove of inclusion in longest chain
   */  
  function claimReward(bytes32[] coinbase, bytes32[] proof) mint() {
    // receive up to 5 hashes of blocks
    // all 5 must have been mined by operator in same claim epoche
    // claim epoche must have passed challenge period
    // reward calculated and payed
    // epoch marked as claimed
  }
  

    /*
   * operator requests to leave
   */
  function requestLeave() public {
    require(operators[msg.sender].stakeAmount > 0);
    require(operators[msg.sender].joinedAt < now - 12 weeks);
    operators[msg.sender].joinedAt = chain[tipHash].height;
    // now the operator will have to wait another 2 epochs
    // before being able to get a pay-out
  }

  /*
   * operator is returned the stake and removed
   */
  function payout(address signerAddr) public {
    Operator memory op = operators[signerAddr];
    // avoid operations for empty fields
    require(op.joinedAt > 0);
    // empty operator
    if (op.stakeAmount > 0) {
      // operator that has requested leave
      require(op.joinedAt <= chain[tipHash].height - (2 * epochLength));
      token.transfer(signerAddr, op.stakeAmount);
    }
    delete operators[signerAddr];
    operatorCount--;
    OperatorLeave(signerAddr, chain[tipHash].height);
  }

  function submitBlockAndPrune(bytes32 prevHash, bytes32 root, bytes32[] orphans) public {
    submitBlock(prevHash, root);
    // delete all blocks that have non-existing parent
    for (uint256 i = 0; i < orphans.length; i++) {
      Block memory orphan = chain[orphans[i]];
      // if orphan exists
      if (orphan.parent > 0) {
        uint256 tmp = chain[tipHash].height;
        // if block is behind archive horizon
        if (tmp >= (3 * epochLength) && orphan.height <= tmp  - (3 * epochLength)) {
          ArchiveBlock(orphan.height, orphans[i]);
          tmp = 0; // mark delete
        }
        // if block is orphaned
        else if (chain[orphan.parent].parent == 0) {          
          tmp = 0; // mark delete
        }
        // if marked, then delete
        if (tmp == 0) {
          delete chain[orphans[i]];
        }
      }
    }
  }

  /*
   * submit a new block on top or next to the tip
   */
  // todo: add another parameter that allows to clear storage
  // from orphaned blocks which have not been captured by prune()
  function submitBlock(bytes32 prevHash, bytes32 root) isOperator public {
    // check parent node exists
    require(chain[prevHash].parent > 0);
    // make sure we can only build on tip or next to it
    uint64 newHeight = chain[prevHash].height + 1;
    uint64 maxHeight = chain[tipHash].height;
    require(maxHeight <= newHeight && newHeight <= maxHeight + 1);
    // make hash of new block
    bytes32 newHash = keccak256(prevHash, newHeight, root);
    // check this block has not been submitted yet
    require(chain[newHash].parent == 0);
    // do some magic if chain extended
    if (newHeight > maxHeight) {
      // new blocks can only be submitted every x Ethereum blocks
      require(block.number >= lastParentBlock + parentBlockInterval);
      tipHash = newHash;
      if (newHeight > epochLength) {
        // prune some blocks
        // iterate backwards for 1 epoche
        bytes32 nextParent = chain[prevHash].parent;
        while(chain[nextParent].height > newHeight - epochLength) {
          nextParent = chain[nextParent].parent;        
        }
        // prune chain 
        prune(nextParent);
      }
      lastParentBlock = uint64(block.number);
      NewHeight(newHeight, root);
    }
    // store the block 
    Block memory newBlock;
    newBlock.parent = prevHash;
    newBlock.height = newHeight;
    newBlock.operator = msg.sender;
    newBlock.parentIndex = uint32(chain[prevHash].children.push(newHash) - 1);
    chain[newHash] = newBlock;
  }

  /*
   * sets a block as the only branch in parent block
   * and deletes all other branches
   */
  function prune(bytes32 hash) internal {
    Block storage parent = chain[chain[hash].parent];
    uint256 i = chain[hash].parentIndex;
    if (i > 0) {
      // swap with child 0
      parent.children[i] = parent.children[0];
      parent.children[0] = hash;
      chain[hash].parentIndex = 0;
    }
    // delete other blocks
    for (i = parent.children.length - 1; i > 0; i--) {
      delete chain[parent.children[i]];
    }
    parent.children.length = 1;
  }
  
  function getBranchCount(bytes32 nodeId) public constant returns(uint childCount) {
    return(chain[nodeId].children.length);
  }

  function getBranchAtIndex(bytes32 nodeId, uint index) public constant returns(bytes32 childId) {
    return chain[nodeId].children[index];
  }

  // operator - stake: 1-5 - total: 100 - already claimed: 1
  // 

  // data = [winner, operator, operator ...]
  // operator: 1b claimCountByOperator - 10b 0x - 1b stake - 20b address
  // winner: 1b claimCountTotal - 11b 0x - 20b address
  function dfs(bytes32[] _data, bytes32 _nodeHash) constant returns(bytes32[] data) {
    Block memory node = chain[_nodeHash];

    data = updateRewards(_data, node.operator);
    
    // more tree to walk
    if (node.children.length > 0) {
      bytes32[][] options = new bytes[node.children.length][_data.length];
      for (i = 0; i < node.children.length; i++) {
        options[i] = dfs(operators, node.children[i]);
      }
      // compare options,
      // return the best
    } 
    // reached a tip, return data
  }

  /*
   * todo
   */    
  function getTip(address[] operators) public constant returns (bytes32, uint64, uint32, address) {
    return (chain[tipHash].parent, chain[tipHash].height, chain[tipHash].parentIndex, chain[tipHash].operator);

    // find consensus horizon
    bytes32 consensusHorizon = chain[tipHash].parent;
    uint256 depth = (chain[tipHash].height < epochLength) ? chain[tipHash].height : chain[tipHash].height - epochLength;
    while(chain[consensusHorizon].height > depth) {
      consensusHorizon = chain[consensusHorizon].parent;        
    }
    // 
    - dfs until tip, add up rewards, save tip as winner
  }
  
  /*
   * todo
   */  
  function getBlock(uint256 height) public view returns (bytes32 root, address operator) {
    require(height <= chain[tipHash].height);
    return (bytes32(height),0);
  }

}

