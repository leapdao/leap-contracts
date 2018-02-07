pragma solidity ^0.4.19;

contract PlasmaRoot {

  address public owner;

  function PlasmaRoot() public {
    owner = msg.sender;
  }

  // submits a block, which is basically just the Merkle root of the transactions
  // in the block
  function submitBlock(bytes32 root) public {

  }

  // generates a block that contains only one transaction, generating a new UTXO
  // into existence with denomination equal to the msg.value deposited
  function deposit() public payable {

  }

  // starts an exit procedure for a given UTXO.
  // Requires as input
  // (i) the Plasma block number and tx index in which the UTXO was created,
  // (ii) the output index,
  // (iii) the transaction containing that UTXO,
  // (iv) a Merkle proof of the transaction, and
  // (v) a confirm signature from each of the previous owners of the now-spent
  // outputs that were used to create the UTXO.
  function startExit(
    uint256 plasmaBlockNum,
    uint256 txindex,
    uint256 oindex,
    bytes tx,
    bytes proof,
    bytes confirmSig
  )
    public
  {

  }

  // challenges an exit attempt in process, by providing a proof that the TXO was spent,
  // the spend was included in a block, and the owner made a confirm signature.
  function challengeExit(
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

  }


}
