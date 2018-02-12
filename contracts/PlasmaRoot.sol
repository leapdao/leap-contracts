pragma solidity ^0.4.19;

import 'zeppelin-solidity/contracts/math/SafeMath.sol';
import './libraries/RLP.sol';

contract PlasmaRoot {
  using SafeMath for uint256;
  using RLP for bytes;
  using RLP for RLP.RLPItem;
  using RLP for RLP.Iterator;

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

  function PlasmaRoot() public {
    owner = msg.sender;
    currentChildBlock = 1;
  }

  // spec: submits a block, which is basically just the Merkle root of the transactions
  // in the block
  function submitBlock(bytes32 root) public {
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
    // TODO: why 130 bytes?
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
  // (i) the Plasma block number and tx index in which the UTXO was created,
  // (ii) the output index,
  // (iii) the transaction containing that UTXO,
  // (iv) a Merkle proof of the transaction, and
  // (v) a confirm signature from each of the previous owners of the now-spent
  // outputs that were used to create the UTXO.
  /*function startExit(
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
