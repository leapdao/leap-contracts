pragma solidity ^0.4.19;

import 'zeppelin-solidity/contracts/math/SafeMath.sol';
import 'zeppelin-solidity/contracts/math/Math.sol';
import './libraries/RLP.sol';
import './libraries/Merkle.sol';
import './libraries/Validate.sol';
import './libraries/PriorityQueue.sol';

contract PlasmaRoot {
  using SafeMath for uint256;
  using RLP for bytes;
  using RLP for RLP.RLPItem;
  using RLP for RLP.Iterator;
  using Merkle for bytes32;

  event Deposit(address depositor, uint256 amount);

  // A list of Plasma blocks, for each block storing
  // (i) the Merkle root,
  // (ii) the time the Merkle root was submitted.
  mapping(uint256 => childBlock) public childChain;
  uint256 public currentChildBlock;

  struct childBlock {
      bytes32 root;
      uint256 created_at;
  }

  address public owner;
  uint256 public lastParentBlock;
  uint256 public weekOldBlock;

  mapping(uint256 => exit) public exits;
  mapping(uint256 => uint256) public exitIds;
  PriorityQueue exitsQueue;

  struct exit {
      address owner;
      uint256 amount;
      uint256[3] utxoPos;
  }

  modifier incrementOldBlocks() {
      while (childChain[weekOldBlock].created_at < block.timestamp.sub(1 weeks)) {
          if (childChain[weekOldBlock].created_at == 0)
              break;
          weekOldBlock = weekOldBlock.add(1);
      }
      _;
  }

  function PlasmaRoot() public {
    owner = msg.sender;
    currentChildBlock = 1;
  }

  // spec: submits a block, which is basically just the Merkle root of the transactions
  // in the block
  function submitBlock(bytes32 root) public incrementOldBlocks {
    require(block.number > lastParentBlock);
    childChain[currentChildBlock] = childBlock({
        root: root,
        created_at: block.timestamp
    });
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
  function deposit(bytes txBytes) public payable {
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
    childChain[currentChildBlock] = childBlock({
        root: root,
        created_at: block.timestamp
    });
    currentChildBlock = currentChildBlock.add(1);
    // depositor address + deposit amount
    Deposit(txList[6].toAddress(), txList[7].toUint());
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
    require(Validate.checkSigs(txHash, childChain[txPos[0]].root, inputCount, sigs));
    require(merkleHash.checkMembership(txPos[1], childChain[txPos[0]].root, proof));
    uint256 priority = 1000000000 + txPos[1] * 10000 + txPos[2];
    uint256 exitId = txPos[0].mul(priority);
    // todo: why do we need weekOldBlock? Why can't we just use old block numbers
    // to calculate priority?
    priority = priority.mul(Math.max256(txPos[0], weekOldBlock));
    // check we are not exiting same UTXO twice
    require(exitIds[exitId] == 0);
    exitIds[exitId] = priority;
    // exitsQueue acts a sorted list
    exitsQueue.insert(priority);
    // ahtung: priority may collide for old blocks if they happen to
    // have same tx id and same output index
    exits[priority] = exit({
        owner: txList[6 + 2 * txPos[2]].toAddress(),
        amount: txList[7 + 2 * txPos[2]].toUint(),
        utxoPos: txPos
    });
  }

  // challenges an exit attempt in process, by providing a proof that the TXO was spent,
  // the spend was included in a block, and the owner made a confirm signature.
  /*function challengeExit(
    uint256 exitId,
    uint256 plasmaBlockNum,
    uint256 txindex,
    uint256 oindex,
    bytes tx,
    bytes proof,
    bytes confirmSig
  )
    public
  {

  }*/


}
