pragma solidity ^0.4.19;

import 'zeppelin-solidity/contracts/math/SafeMath.sol';
import 'zeppelin-solidity/contracts/math/Math.sol';
import "./lib/RLP.sol";
import "./lib/Merkle.sol";
import "./lib/Validate.sol";
import "./ds/PriorityQueue.sol";


contract RootChain {
  using SafeMath for uint256;
  using RLP for bytes;
  using RLP for RLP.RLPItem;
  using RLP for RLP.Iterator;
  using Merkle for bytes32;

  /*
   * Events
   */
  event Deposit(address depositor, uint256 amount);
  event ChildBlockCreated(uint256 blockNumber, bytes32 root);
  event DepositBlockCreated(uint256 blockNumber, bytes32 root, bytes txBytes);
  event StartExit(
    address indexed owner,
    uint256 blockNumber,
    uint256 txIndex,
    uint256 outputIndex
  );

  // A list of Plasma blocks, for each block storing
  // (i) the Merkle root,
  // (ii) the time the Merkle root was submitted.
  mapping(uint256 => ChildBlock) public childChain;
  mapping(uint256 => Exit) public exits;

  PriorityQueue exitsQueue;

  address public authority;
  uint256 public currentChildBlock;
  uint256 public lastParentBlock;
  uint256 public recentBlock;
  uint256 public weekOldBlock;

  struct Exit {
    address owner;
    uint256 amount;
    uint256[3] utxoPos;
  }

  struct ChildBlock {
    bytes32 root;
    uint256 createdAt;
  }

  /*
   *  Modifiers
   */
  modifier isAuthority() {
    require(msg.sender == authority);
    _;
  }

  modifier incrementOldBlocks() {
    while (childChain[weekOldBlock].createdAt < block.timestamp.sub(1 weeks)) {
      if (childChain[weekOldBlock].createdAt == 0) {
        break;
      }
      weekOldBlock = weekOldBlock.add(1);
    }
    _;
  }

  function RootChain()
    public
  {
    authority = msg.sender;
    currentChildBlock = 1;
    lastParentBlock = block.number;
    exitsQueue = new PriorityQueue();
  }

  // spec: submits a block, which is basically just the Merkle root of the transactions
  // in the block
  function submitBlock(bytes32 root)
    public
    isAuthority
    incrementOldBlocks
  {
    require(block.number >= lastParentBlock.add(6));
    childChain[currentChildBlock] = ChildBlock({
      root: root,
      createdAt: block.timestamp
    });
    ChildBlockCreated(currentChildBlock, root);

    currentChildBlock = currentChildBlock.add(1);
    lastParentBlock = block.number;
  }

  /*
   * spec: generates a block that contains only one transaction, generating a new UTXO
   * into existence with denomination equal to the msg.value deposited
   *
   * txList is unfolded tx bytes with items as following:
   *  0 - input 1 block number  - 0
   *  1 - input 1 tx index      - 0
   *  2 - input 1 output index  - 0
   *  3 - input 2 block number  - 0
   *  4 - input 2 tx index      - 0
   *  5 - input 2 output index  - 0
   *  6 - output 1 address      - depositor address
   *  7 - output 1 amount       - deposited amount in wei
   *  8 - output 2 address      - 0
   *  9 - output 2 amount       - 0
   * 10 - fee                   -
   */
  function deposit(bytes txBytes)
    public
    payable
  {
    // RLP encoded transaction
    var txList = txBytes.toRLPItem().toList();
    // 11 elements. See transaction.py
    require(txList.length == 11);
    // for deposits inputs should be 0    
    for (uint256 i; i < 6; i++) {
      require(txList[i].toUint() == 0);
    }
    // value of the first output is ETH amount deposited
    require(txList[7].toUint() == msg.value);
    // value of the second output is 0
    require(txList[9].toUint() == 0);
    bytes32 zeroBytes;
    // new bytes(130) — two empty signatures (65 bytes each)?
    bytes32 root = keccak256(keccak256(txBytes), new bytes(130));
    // Calc merkle root for 16 level tree with just one tx.
    // spec: Each Merkle root should be a root of a tree with depth-16 leaves,
    // where each leaf is a transaction
    for (i = 0; i < 16; i++) {
      root = keccak256(root, zeroBytes);
      zeroBytes = keccak256(zeroBytes, zeroBytes);
    }
    // create new block with a single tx
    childChain[currentChildBlock] = ChildBlock({
      root: root,
      createdAt: block.timestamp
    });
    ChildBlockCreated(currentChildBlock, root);
    DepositBlockCreated(currentChildBlock, root, txBytes);

    currentChildBlock = currentChildBlock.add(1);
    // depositor address + deposit amount
    Deposit(txList[6].toAddress(), txList[7].toUint());
  }

  function getChildChain(uint256 blockNumber)
    public
    view
    returns (bytes32, uint256)
  {
    return (childChain[blockNumber].root, childChain[blockNumber].createdAt);
  }

  function getExit(uint256 exitId)
    public
    view
    returns (address, uint256, uint256[3])
  {
    return (exits[exitId].owner, exits[exitId].amount, exits[exitId].utxoPos);
  }

  // starts an exit procedure for a given UTXO.
  // Requires as input
  // (1) txPos[0] - the Plasma block number
  // (2) txPos[1] - tx index in which the UTXO was created,
  // (3) txPos[2] - the output index,
  // (4) txBytes - the transaction containing that UTXO,
  // (5) proof - a Merkle proof of the transaction, and
  // (6) sigs - a confirm signature from each of the previous owners of the now-spent
  // outputs that were used to create the UTXO.
  //
  // structure of sigs bytes [sig1, sig2, confSig1, confSig2]
  // each sig is 65 bytes
  //
  // proof - 512 bytes. Thats 16 hashes of 32 bytes each, one hash per merkle tree level
  function startExit(
    uint256[3] txPos,
    bytes txBytes,
    bytes proof,
    bytes sigs
  )
    public
    incrementOldBlocks
  {
    var txList = txBytes.toRLPItem().toList();
    // check we have transaction. See comments to deposit() for tx bytes structure
    require(txList.length == 11);
    // sender's address must be an address in tx output. It is either txList[6] or txList[8]
    require(msg.sender == txList[6 + 2 * txPos[2]].toAddress());
    bytes32 txHash = keccak256(txBytes);
    bytes32 merkleHash = keccak256(txHash, ByteUtils.slice(sigs, 0, 130));
    // joining block numbers of tx inputs
    uint256 inputCount = txList[3].toUint() * 1000000 + txList[0].toUint();
    // todo: why do we need confSigs when exiting?
    require(
      Validate.checkSigs(
        txHash,
        childChain[txPos[0]].root,
        inputCount,
        sigs
      )
    );
    require(merkleHash.checkMembership(txPos[1], childChain[txPos[0]].root, proof));
    uint256 priority = 1000000000 + txPos[1] * 10000 + txPos[2];
    uint256 exitId = txPos[0].mul(priority);
    // todo: why do we need weekOldBlock? Why can't we just use old block numbers
    // to calculate priority?
    priority = priority.mul((txPos[0] > weekOldBlock) ? txPos[0] : weekOldBlock);
    // check we are not exiting same UTXO twice
    require(exits[exitId].amount == 0);
    // exitsQueue acts a sorted list
    exitsQueue.insert((priority << 128) | exitId);
    // ahtung: priority may collide for old blocks if they happen to
    // have same tx id and same output index
    exits[exitId] = Exit({
      owner: txList[6 + 2 * txPos[2]].toAddress(),
      amount: txList[7 + 2 * txPos[2]].toUint(),
      utxoPos: txPos
    });

    // broadcast start exit event
    StartExit(txList[6 + 2 * txPos[2]].toAddress(), txPos[0], txPos[1], txPos[2]);
  }

  /// spec: challenges an exit attempt in process, by providing a proof that the TXO was spent,
  /// the spend was included in a block, and the owner made a confirm signature.
  ///
  /// exitId - id of the exit (see startExit)
  /// (1) txPos[0] - the Plasma block number
  /// (2) txPos[1] - tx index in which the UTXO was created,
  /// (3) txPos[2] - the output index,
  /// (4) txBytes - the transaction containing that UTXO,
  /// (5) proof - a Merkle proof of the transaction, and
  /// (6) sigs - a confirm signature from each of the previous owners of the now-spent
  ///            outputs that were used to create the UTXO.
  /// (7) confirmationSig - commitment from the owner of UTXO(txPos) that he saw his tx (txBytes)
  ///                       included in the child block (txPos[0])
  ///
  /// by calling challengeExit a challenger says "I declare that UTXO which is trying
  /// to exit as exitId is already spend as TXO specified in txPos. Here is TXO bytes
  /// with input signatures, merkle proof and confirmation from TXO owner that he saw
  /// his TX in the block (= he confirmed spend)"
  function challengeExit(
    uint256 exitId,
    uint256[3] txPos,
    bytes txBytes,
    bytes proof,
    bytes sigs,
    bytes confirmationSig
  )
    public
  {
    var txList = txBytes.toRLPItem().toList();
    require(txList.length == 11);
    uint256[3] memory exitsUtxoPos = exits[exitId].utxoPos;
    // check that tx we supplied is for challenged TXO
    require(exitsUtxoPos[0] == txList[0 + 2 * exitsUtxoPos[2]].toUint());
    require(exitsUtxoPos[1] == txList[1 + 2 * exitsUtxoPos[2]].toUint());
    require(exitsUtxoPos[2] == txList[2 + 2 * exitsUtxoPos[2]].toUint());
    var txHash = keccak256(txBytes);
    var confirmationHash = keccak256(txHash, sigs, childChain[txPos[0]].root);
    var merkleHash = keccak256(txHash, sigs);
    address owner = exits[exitId].owner;
    // check that tx (txBytes) was seen by spender in the chain. At some point he
    // confirmed that by signing confirmation hash with his key
    require(owner == ECRecovery.recover(confirmationHash, confirmationSig));
    // check that tx (txBytes) was indeed included in the block txPos[0]
    require(merkleHash.checkMembership(txPos[1], childChain[txPos[0]].root, proof));
    // if we are here, it means UTXO in exit (exitId) is already spent,
    // so the exit is invalid and should be deleted
    delete exits[exitId];
    // todo: for proper plasma we need to penalize TXO owner for fraudlent exit
    // for Plasma MVP it is assumed everyone should be exiting at this point
    // todo: how do they know? Emit event here?gi
  }

  function finalizeExits()
    public
    incrementOldBlocks
    returns (uint256)
  {
    uint256 twoWeekOldTimestamp = block.timestamp.sub(2 weeks);
    Exit memory currentExit = exits[uint128(exitsQueue.getMin())];
    while (childChain[currentExit.utxoPos[0]].createdAt < twoWeekOldTimestamp && exitsQueue.currentSize() > 0) {
      uint256 exitId = currentExit.utxoPos[0] * 1000000000 + currentExit.utxoPos[1] * 10000 + currentExit.utxoPos[2];
      currentExit.owner.transfer(currentExit.amount);
      uint256 priority = exitsQueue.delMin();
      delete exits[priority];
      currentExit = exits[exitsQueue.getMin()];
    }
  }
}
