pragma solidity ^0.4.19;

import "zeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "zeppelin-solidity/contracts/math/SafeMath.sol";
  
  
contract ParsecBridge {
  using SafeMath for uint256;
  
  uint256 constant maxOpCount = 64; // max number of operators with stake, also length of 1 epoche in blocks
  bytes32 constant genesis = 0x4920616d207665727920616e6772792c20627574206974207761732066756e21; // I am very angry, but it was fun!
  ERC20 public token;

  event NewHeight(uint256 blockNumber, bytes32 root);
  event OperatorJoin(uint256 blockNumber, address signerAddr);
  event OperatorLeave(uint256 blockNumber, address signerAddr);

  struct Block {
    bytes32 parent; // the id of the parent node
    uint64 height;
    uint32 parentIndex; //  the position of this node in the Parent's children list
    address operator; // the operator that submitted the block
    bytes32[] children; // unordered list of children below this node
    // more node attributes here
  }

  mapping(bytes32 => Block) public chain;
  uint32 public parentBlockInterval;
  uint64 public lastParentBlock;
  bytes32 public tipHash;
  uint32 public operatorCount;

  struct Operator {
    // joinedAt is unix timestamp while operator active.
    // once operator requested leave joinedAt set to block height when requested exit
    uint64 joinedAt; 
    uint64 claimedUntil;
    uint256 stakeAmount;
  }
  
  mapping(address => Operator) public operators;


  function ParsecBridge(ERC20 _token, uint256 _parentBlockInterval) public {
    require(_token != address(0));
    token = _token;
    Block memory genBlock;
    genBlock.parent = genesis; 
    tipHash = keccak256(genesis, uint64(0), bytes32(0));
    chain[tipHash] = genBlock;
    parentBlockInterval = uint32(_parentBlockInterval);
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
    require(operators[msg.sender].stakeAmount + amount <= token.totalSupply().div(maxOpCount).mul(5));
    require(token.allowance(msg.sender, this) >= amount);
    require(operatorCount < maxOpCount);

    token.transferFrom(msg.sender, this, amount);
    operatorCount++;
    
    operators[msg.sender] = Operator({
      joinedAt: uint32(now),
      claimedUntil: (chain[tipHash].height & 0xffffffffffffff40), // most recent epoche
      stakeAmount: amount
    });
    OperatorJoin(chain[tipHash].height, msg.sender);
  }

  /*
   * operator is payed out and removed
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
      require(op.joinedAt <= chain[tipHash].height - (2 * maxOpCount));
      token.transfer(signerAddr, op.stakeAmount);
    }
    delete operators[signerAddr];
    operatorCount--;
  }
  
  // todo: add another parameter that allows to clear storage
  // from orphaned blocks which have not been captured by prune()
  function submitBlock(bytes32 prevHash, bytes32 root) public isOperator {
    // check parent node exits
    require(chain[prevHash].parent > 0);
    // make sure we can only build on tip or next to it
    uint64 newHeight = chain[prevHash].height + 1;
    uint64 maxHeight = chain[tipHash].height;
    require(maxHeight <= newHeight && newHeight <= maxHeight + 1);
    // make hash of new block
    bytes32 newHash = keccak256(prevHash, newHeight, root);
    // do some magic if chain extended
    if (newHeight > maxHeight) {
      // new blocks can only be submitted every x Ethereum blocks
      require(block.number >= lastParentBlock + parentBlockInterval);
      tipHash = newHash;
      // prune some blocks
      // itterate from 1 epoche back
      if (newHeight > maxOpCount) {
        bytes32 nextParent = chain[prevHash].parent;
        while(chain[nextParent].height > newHeight - maxOpCount) {
          nextParent = chain[nextParent].parent;        
        }
        // prune chain 
        prune(nextParent);
      }
      lastParentBlock = uint64(block.number);
      NewHeight(newHeight, root);
    }
    // check this block has not been submitted yet
    require(chain[newHash].parent == 0);
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
  function prune(bytes32 hash) public {
    Block storage parent = chain[chain[hash].parent];
    if (chain[hash].parentIndex > 0) {
      // delete child 0
      delete chain[parent.children[0]].children;
      delete chain[parent.children[0]];
      // move this block to child 0
      chain[hash].parentIndex = 0;
      parent.children[0] = hash;
    }
    // delete other blocks
    for (uint256 i = parent.children.length - 1; i > 0; i--) {
      delete chain[parent.children[i]].children;
      delete chain[parent.children[i]];
      parent.children.length--;
    }
  }
  
  function getBranchCount(bytes32 nodeId) public constant returns(uint childCount) {
    return(chain[nodeId].children.length);
  }

  function getBranchAtIndex(bytes32 nodeId, uint index) public constant returns(bytes32 childId) {
    return chain[nodeId].children[index];
  }

  /*
   * todo
   */    
  function getTip() public constant returns (bytes32, uint64, uint32, address) {
    return (chain[tipHash].parent, chain[tipHash].height, chain[tipHash].parentIndex, chain[tipHash].operator);

  }
  
  /*
   * todo
   */  
  function getBlock(uint256 height) public view returns (bytes32 root, address operator) {
    require(height <= chain[tipHash].height);
    return (bytes32(height),0);
  }

}
