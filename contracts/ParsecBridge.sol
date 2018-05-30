pragma solidity ^0.4.19;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

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
  event NewDeposit(uint32 indexed depositId, address depositor);

  struct Block {
    bytes32 parent; // the id of the parent node
    uint64 height;  // the height this block is stored at
    uint32 parentIndex; //  the position of this node in the Parent's children list
    uint32 gasPrice; // the gas price of transaction with block submission
    address operator; // the operator that submitted the block
    bytes32[] children; // unordered list of children below this node
    // more node attributes here
  }
  mapping(bytes32 => Block) public chain;

  uint32 public parentBlockInterval; // how often plasma blocks can be submitted max
  uint64 public lastParentBlock; // last ethereum block when plasma block submitted
  uint32 public operatorCount; // number of staked operators
  uint32 public epochLength; // length of 1 epoch in child blocks
  uint64 public blockReward; // reward per single block
  uint32 public stakePeriod;
  uint256 public totalStake;
  bytes32 public tipHash;    // hash of first block that has extended chain to some height

  //todo remove after tests
  uint256 averageGasPrice;

  struct Operator {
    // joinedAt is unix timestamp while operator active.
    // once operator requested leave joinedAt set to block height when requested exit
    uint64 joinedAt;
    uint64 claimedUntil; // the epoch until which all reward claims have been processed
    uint256 stakeAmount; // amount of staken tokens
  }
  mapping(address => Operator) public operators;

  struct Deposit {
    uint64 height;
    address owner;
    uint256 amount;
  }
  mapping(uint32 => Deposit) public deposits;
  uint32 depositCount = 0;

  struct Exit {
    uint64 amount;
    uint32 opened;
    address owner;
  }
  mapping(bytes32 => Exit) public exits;


  // todo - test function that averages gas price of last 20 submitted blocks
  // fuction will be called every block submission
  // need to check are there 20 block in chain
//   check gasLeft
  // todo tests

  /* todo - 2 variant: create storage variable, that should be calculate and set on each block submission
    then getter should be just view func */

  event DebugEvent(uint value);

  function getAverageGasPrice() view returns (uint256 gasPrice) {
    emit DebugEvent(gasleft());
    Block storage b = chain[tipHash];
    uint256 gasSum = 0;
    for (uint256 i = 0; i < (b.height < 20 ? b.height : 20); i++) {
      gasSum += b.gasPrice;
      b = chain[chain[tipHash].parent];
    }
    gasPrice /= 20;
    emit DebugEvent(gasleft());
  }

  function testAverageToStorage() {
    emit DebugEvent(gasleft());
    averageGasPrice = averageGasPrice - averageGasPrice / 15 + tx.gasprice / 15;
    emit DebugEvent(gasleft());
  }

  constructor(ERC20 _token, uint32 _parentBlockInterval, uint32 _epochLength, uint64 _blockReward, uint32 _stakePeriod) public {
    require(_token != address(0));
    token = _token;
    Block memory genBlock;
    genBlock.operator = msg.sender;
    genBlock.parent = genesis;
    genBlock.gasPrice = 1;
    tipHash = genesis;
    chain[tipHash] = genBlock;
    parentBlockInterval = _parentBlockInterval;
    epochLength = _epochLength;
    lastParentBlock = uint64(block.number);
    blockReward = _blockReward;
    stakePeriod = _stakePeriod;
    emit DebugEvent(tx.gasprice);
  }

  modifier mint() {
    // todo: mine some tokens, if needed
    _;
  }

  /*
   * Add an operator
   */
  function join(uint256 amount) public {
    require(amount >= (totalStake + amount) / epochLength);
    require(operatorCount < epochLength);

    token.transferFrom(msg.sender, this, amount);
    totalStake += amount;
    operatorCount++;

    operators[msg.sender] = Operator({
      joinedAt: uint32(now),
      claimedUntil: ((chain[tipHash].height / epochLength) * epochLength), // most recent epoch
      stakeAmount: amount
    });
    emit OperatorJoin(msg.sender, chain[tipHash].height);
  }

  /*
   * operator requests to leave
   */
  function requestLeave() public {
    require(operators[msg.sender].stakeAmount > 0);
    require(operators[msg.sender].joinedAt < now - (stakePeriod));
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
      uint stake = op.stakeAmount;
      op.stakeAmount = 0;
      token.transfer(signerAddr, stake);
    }
    delete operators[signerAddr];
    operatorCount--;
    emit OperatorLeave(signerAddr, chain[tipHash].height);
  }

  function submitBlockAndPrune(bytes32 prevHash, bytes32 root, uint8 v, bytes32 r, bytes32 s, bytes32[] orphans) public {
    submitBlock(prevHash, root, v, r, s);
    // delete all blocks that have non-existing parent
    for (uint256 i = 0; i < orphans.length; i++) {
      Block memory orphan = chain[orphans[i]];
      // if orphan exists
      if (orphan.parent > 0) {
        uint256 tmp = chain[tipHash].height;
        // if block is behind archive horizon
        if (tmp >= (3 * epochLength) && orphan.height <= tmp  - (3 * epochLength)) {
          emit ArchiveBlock(orphan.height, orphans[i]);
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


  event Flag(string comment);
  event DebugEvent(bytes32 value);

  /*
   * submit a new block
   *
   * block hash process:
   * 1. block generated: prevHash, height, root
   * 2. sigHash: keccak256(prevHash, height, root) + priv => v, r, s
   * 3. block hash: keccak256(prevHash, height, root, v, r, s)
   */
  function submitBlock(bytes32 prevHash, bytes32 root, uint8 v, bytes32 r, bytes32 s) public {
    // check parent node exists
    require(chain[prevHash].parent > 0);
    // calculate height
    uint64 newHeight = chain[prevHash].height + 1;
    // TODO recover operator address and check membership
    bytes32 sigHash = keccak256(prevHash, newHeight, root);
    address operatorAddr = ecrecover(sigHash, v, r, s);
    require(operators[operatorAddr].joinedAt > 1409184000); // Aug 28, 2014 - Harold Thomas Finney II
    // make sure block is placed in consensus window
    uint256 maxDepth = (chain[tipHash].height < epochLength) ? 0 : chain[tipHash].height - epochLength;
    require(maxDepth <= newHeight && newHeight <= chain[tipHash].height + 1);
    // make hash of new block
    bytes32 newHash = keccak256(prevHash, newHeight, root, v, r, s);
    // check this block has not been submitted yet
    require(chain[newHash].parent == 0);
    // do some magic if chain extended
    if (newHeight > chain[tipHash].height) {
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
      emit NewHeight(newHeight, root);
    }
    // store the block
    Block memory newBlock;
    newBlock.parent = prevHash;
    newBlock.height = newHeight;
    newBlock.operator = operatorAddr;
    newBlock.gasPrice = uint32((tx.gasprice).div(10 ** 11));
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

  function deleteBlock(bytes32 hash) internal {
    Block storage parent = chain[chain[hash].parent];
    uint256 i = chain[hash].parentIndex;
    if (i < parent.children.length - 1) {
      // swap with last child
      parent.children[i] = parent.children[parent.children.length - 1];
      chain[parent.children[i]].parentIndex = uint32(i);
    }
    parent.children.length--;
    if (hash == tipHash) {
      tipHash = chain[hash].parent;
    }
    delete chain[hash];
  }

  function slashOperator(address _opAddr, uint256 _slashAmount) internal {
    Operator storage op = operators[_opAddr];
    if (op.stakeAmount < _slashAmount) {
      _slashAmount = op.stakeAmount;
    }
    op.stakeAmount -= _slashAmount;
  }


  function reportHeightConflict(bytes32 hashA, bytes32 hashB) public {
    require(hashA != hashB);
    Block storage blockA = chain[hashA];
    require(blockA.height == chain[hashB].height);
    require(blockA.height > chain[tipHash].height - epochLength);
    require(blockA.operator == chain[hashB].operator);
    // slash 10 block rewards
    slashOperator(blockA.operator, 10 * blockReward);
    // reward 1 block reward
    token.transfer(msg.sender, blockReward);
  }

  /* Clipping implementation
   *
   * the consensus horizon trims the graph according to the first path that grows longer than epochLength.
   * The longest branch is not necessarily the one with the most rewards payed, but could be forced by
   * a malicious operator that is ready to pay main-net fees to get his blocks in, without receiving any
   * additional reward just to grieve the other operators.
   * We introduce clipping to be able to submit a proof that some branch is long, but not heavy. The branch
   * will then be "clipped off", by deleting the first node after the fork on the light branch.
   *
   * Example:
   *   epochLength = 6
   *   stake: a = 2, b = 2, c = 2
   *
   *                   /-> b[2,b] -> b[3,b] -> b[4,b] -> b[5,b]   <- rewards = 3, light branch
   *   b[0,a] -> b[1,b] -> b[2,c] -> b[3,a] -> b[4,b]             <- rewards = 5, heavy branch
   *
   * clipping conditions:
   * - a branch covers >= 2/3 of epochLength
   * - filling up the light branch with reward blocks will not outweight heavy branch
   *
   * data:
   * data[0]        = forkNodeHash
   * data[1]        = 1b claims light, 5b mappings light, 1b claims heavy, 5b mappings heavy, 20b operator
   * ...
   * data[length-3] = 1b claims light, 5b mappings light, 1b claims heavy, 5b mappings heavy, 20b operator
   * data[length-2] = heavyBranchTipHash
   * data[length-1] = lightBranchTipHash
   * data size: (epochLength + 3) * 32b
   *
   * max complexity: assuming that all operators have min stake, and max amount of operators participate,
   * there could exist 2 branches with epochLength-1 fork distance, giving:
   *   O(4 * epochLength)
   *
   * Q: could we restrict the amount of blocks that one operator can submit in the consensus windown
   */
  function reportLightBranch(bytes32[] _data) public {
    bool isLight;
    bytes32 prevHash;
    (isLight, prevHash) = isLightBranch(_data);
    if (isLight) {
      deleteBlock(prevHash);
    }
    tipHash = _data[_data.length-2];
    // reward 1 block reward
    token.transfer(msg.sender, blockReward);
  }

  function buildMap(bytes32[] _data, uint256 _offset) internal constant returns (uint256[] map) {
    map = new uint256[](epochLength + 1);
    for (uint i = 1; i < _data.length - 2; i++) {
      uint256 stake = (operators[address(_data[i])].stakeAmount * epochLength) / totalStake;
      if (stake > totalStake.div(20)) {
        stake = totalStake.div(20);
      }
      uint256 claimCount = 0;
      for (uint j = (_offset + 40); j > _offset; j = j - 8) {
        uint8 pos = uint8(_data[i] >> j);
        if (pos > 0) {
            claimCount++;
            map[pos] = i;
        }
      }
      require(claimCount <= stake);
    }
  }

  function getWeight(bytes32[] _data, bytes32 nodeHash, uint256[] _map) internal constant returns (uint256 weight, uint256 i, bytes32 prevHash) {
    // check heavy path to common fork
    i = 0;
    bytes32 previous;
    weight = 0;
    while(nodeHash != _data[0]) {
      i++;
      // if we have a claim
      if (_map[i] > 0) {
        // check correctnes of mapping
        require(chain[nodeHash].operator == address(_data[_map[i]]));
        weight++;
      }
      prevHash = previous;
      previous = nodeHash;
      nodeHash = chain[nodeHash].parent;
    }
  }

  function isLightBranch(bytes32[] _data) constant internal returns (bool isLight, bytes32 prevHash) {
    require(_data.length < epochLength + 3);

    // build heavy-branch mapping
    uint256[] memory map = buildMap(_data, 160);

    // check heavy path to common fork
    uint256 heavyWeight;
    uint256 length;
    (heavyWeight, length, ) = getWeight(_data, _data[_data.length-2], map);

    // build light mapping
    map = buildMap(_data, 208);

    // check light path to common fork
    uint256 lightWeight;
    (lightWeight, length, prevHash) = getWeight(_data, _data[_data.length-1], map);

    // only forks longer than 2/3 of epochLength matter
    require(length >= (epochLength * 2) / 3);

    // compare branch weights
    isLight = (lightWeight + (epochLength - length) <= heavyWeight);
  }

 /*          /-> []
  *    /-> [] -> []/-> []  3   -> l, l, r
  *  [] -> [] -> [] -> []  2
  *          \-> []
  */
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
    //uint256 startPos = uint8(_proof[3] >> 248);
    bytes memory txData = new bytes(txLength);
    // txHash = bytes32(txLength);
    // return;
    assembly {
      calldatacopy(add(txData, 0x20), add(178, offset), txLength)
    }
    Block memory b = chain[_proof[0]];
    txHash = keccak256(txData);
    //return;
    txPos = uint64(_proof[3] >> 160);
    bytes32 root = getMerkleRoot(txHash, txPos, uint8(_proof[3] >> 240), _proof);
    bytes32 blockHash = keccak256(b.parent, b.height, root, uint8(_proof[3] >> 144), _proof[1], _proof[2]);
    require(blockHash == _proof[0]);
  }

  /*
   * _txData = [ 32b blockHash, 32b r, 32b s, (1b Proofoffset, 8b pos, 1b v, ..00.., 1b txData), 32b txData, 32b proof, 32b proof ]
   *
   * # 2 Deposit TX (33b)
   *   1b type
   *     4b depositId
   *     8b value, 20b address
   *
   */
  function reportInvalidDeposit(bytes32[] _txData) public {
    Block memory b = chain[_txData[0]];
    if (chain[tipHash].height > epochLength) {
      require(b.height > chain[tipHash].height - epochLength);
    }
    // check transaction proof
    validateProof(17, _txData);

    // check deposit values
    uint32 depositId = uint32(_txData[4] >> 224);
    uint64 value = uint64(_txData[4] >> 160);
    Deposit memory dep = deposits[depositId];
    require(value != dep.amount || address(_txData[4]) != dep.owner || b.height > dep.height + 2);

    // delete invalid block
    deleteBlock(_txData[0]);
    // EVENT
    // slash operator
    slashOperator(b.operator, 10 * blockReward);
    // reward 1 block reward
    token.transfer(msg.sender, blockReward);
  }


  function reportDoubleSpend(bytes32[] _proof, bytes32[] _prevProof) public {
    // make sure block can still be slashed
    Block memory b = chain[_proof[0]];
    if (chain[tipHash].height > epochLength) {
      require(b.height > chain[tipHash].height - epochLength);
    }
    // TODO: either PrevProof has to be final or in parent block of proof
    // otherwise sibling blocks can be slashed
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
    // delete invalid block
    deleteBlock(_proof[0]);
    // EVENT
    // slash operator
    slashOperator(b.operator, 10 * blockReward);
    // reward 1 block reward
    token.transfer(msg.sender, blockReward);
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
  function getHighest() public constant returns (bytes32, uint64, uint32, address) {
    return (chain[tipHash].parent, chain[tipHash].height, chain[tipHash].parentIndex, chain[tipHash].operator);
  }

  // data = [winnerHash, claimCountTotal, operator, operator ...]
  // operator: 1b claimCountByOperator - 10b 0x - 1b stake - 20b address
  function dfs(bytes32[] _data, bytes32 _nodeHash) internal constant returns(bytes32[] data) {
    Block memory node = chain[_nodeHash];
    // visit this node
    data = new bytes32[](_data.length);
    for (uint256 i = 1; i < _data.length; i++) {
      data[i] = _data[i];
    }
    // find the operator that mined this block
    i = 2;
    while(address(data[i]) != node.operator) {
      require(i++ < data.length);
    }
    // parse operator stake and claim status
    uint256 claimCountByOperator = uint256(data[i]) >> 248;
    uint256 stakeByOperator = uint168(data[i]) >> 160;
    // if operator can claim rewards, assign
    if (claimCountByOperator < stakeByOperator) {
      data[i] = bytes32(claimCountByOperator + 1 << 248) | bytes32(uint248(data[i]));
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
    }
    else {
      data[0] = _nodeHash;
      data[1] = bytes32(uint256(data[1]) + 1);
    }
    // else - reached a tip
    // return data
  }

  function getTip(address[] _operators) public constant returns (bytes32, uint256) {
    // find consensus horizon
    bytes32 consensusHorizon = chain[tipHash].parent;
    uint256 depth = (chain[tipHash].height < epochLength) ? 0 : chain[tipHash].height - epochLength;
    while(chain[consensusHorizon].height > depth) {
      consensusHorizon = chain[consensusHorizon].parent;
    }

    // create data structure for depth first search
    bytes32[] memory data = new bytes32[](_operators.length + 2);
    for (uint i = 2; i < _operators.length + 2; i++) {
      data[i] = bytes32(((operators[_operators[i-2]].stakeAmount * epochLength) / totalStake) << 160) | bytes32(_operators[i-2]);
    }
    // run search
    bytes32[] memory rsp = dfs(data, consensusHorizon);
    // return result
    return (rsp[0], uint256(rsp[1]) >> 128);
  }

  function getBlock(uint256 height) public view returns (bytes32 root, address operator) {
    require(height <= chain[tipHash].height);
    return (bytes32(height),0);
  }



  /*
   * Add funds
   */
  function deposit(uint256 amount) public {
    token.transferFrom(msg.sender, this, amount);
    depositCount++;
    deposits[depositCount] = Deposit({
      height: chain[tipHash].height,
      owner: msg.sender,
      amount: amount
    });
    emit NewDeposit(depositCount, msg.sender);
  }


  function recoverTxSigner(uint256 offset, bytes32[] _proof) internal pure returns (address dest) {
    uint16 txLength = uint16(_proof[3] >> 224);
    bytes memory txData = new bytes(txLength);
    bytes32 r;
    bytes32 s;
    uint8 v;
    assembly {
      calldatacopy(add(txData, 32), add(178, offset), 43)
      r := calldataload(add(221, offset))
      s := calldataload(add(253, offset))
      v := calldataload(add(254, offset))
      calldatacopy(add(txData, 140), add(286, offset), 28) // 32 + 43 + 65
    }
    dest = ecrecover(keccak256(txData), v, r, s);
  }

  /*
   * Take funds
   */
  function withdrawBurn(bytes32[] _proof) public {
    // make sure block is final
    Block memory b = chain[_proof[0]];
    require(chain[tipHash].height > epochLength);
    require(b.height < chain[tipHash].height - epochLength);

    // validate proof
    bytes32 txHash;
    ( , txHash) = validateProof(10, _proof);

    // check not withdrawn yet
    require(exits[txHash].amount == 0);

    address dest;
    uint64 amount;
    assembly {
      // first output
      amount := calldataload(272)
      dest := calldataload(292)
    }
    require(dest == address(this));

    // recover signer
    dest = recoverTxSigner(10, _proof);

    exits[txHash] = Exit({
      amount: amount,
      opened: uint32(now - 4 days),
      owner: dest
    });

    // EVENT
    token.transfer(dest, amount);
  }

}
