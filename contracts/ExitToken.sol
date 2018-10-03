pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/token/ERC721/ERC721BasicToken.sol";
import "./ParsecBridge.sol";
import "./TxLib.sol";

contract ExitToken is ERC721BasicToken {

  event Debug(bytes data);
  event ProxyExit(address exiter, uint256 utxoId);

  bool public bridgeHasBeenSet;
  ParsecBridge public bridge;
  mapping (uint256 => address) public exitColor;
  mapping (uint256 => uint256) public exitValue;

  function setBridge(address b) public {
    require(!bridgeHasBeenSet);
    bridge = ParsecBridge(b);
    bridgeHasBeenSet = true;
  }

  function proxyExit(bytes32[] _proof, uint256 _oindex) public {
    uint256 utxoId = uint256(bridge.startExit(_proof, _oindex));
    address exiter = recoverSigner(_proof);
    _mint(exiter, utxoId);
    emit ProxyExit(exiter, utxoId);
  }

  function exitFinalised(uint256 utxoId, address color, uint256 value) public {
    require(msg.sender == address(bridge));
    exitColor[utxoId] = color;
    exitValue[utxoId] = value;
  }

  function withdrawUtxo(uint256 utxoId) public {
    require(exitValue[utxoId] > 0);
    ERC20(exitColor[utxoId]).transfer(ownerOf(utxoId), exitValue[utxoId]);
    delete exitColor[utxoId];
    delete exitValue[utxoId];
    _burn(ownerOf(utxoId), utxoId);
  }

  // funds withdrawal:
  // - check NFT has been succesfully exited????
  // - check what color and what value it was
  // - transfer value coins to owner of nft

  // will only work from proxyExit due to calldata offset
  function recoverSigner(bytes32[] _proof) public pure returns (address signer) {
    uint256 offset = uint16(_proof[1] >> 248);
    uint256 txLength = uint16(_proof[1] >> 224);

    bytes memory txData = new bytes(txLength);

    // Use this to find calldata offset if params change
    // uint256 size;
    // assembly {
    //   size := calldatasize()
    // }
    // bytes memory callData = new bytes(size);
    // assembly {
    //   calldatacopy(add(callData, 32), 0, size)
    // }
    // emit Debug(callData);

    assembly {
      calldatacopy(add(txData, 32), add(100, offset), txLength)
    }
    bytes memory sigData = sigBytes(txData, txLength);
    TxLib.Tx memory txn = TxLib.parseTx(txData);
    signer = ecrecover(keccak256(sigData), txn.ins[0].v, txn.ins[0].r, txn.ins[0].s);
  }

  // TODO: might be writing to memory out of bounds
  function sigBytes(bytes txData, uint256 txLength) public pure returns (bytes memory sigData) {
    uint256 offset;
    bytes32 firstOne;
    assembly {
      firstOne := mload(add(txData, 32))
    }
    uint8 numInputs = uint8((firstOne << 8) >> 252);
    sigData = new bytes(txLength);
    assembly {
      mstore8(add(sigData, 32), byte(0, mload(add(txData, 32))))
      mstore8(add(sigData, 33), byte(1, mload(add(txData, 32))))
      offset := 0
      for
        { let i := 0 }
        lt(i, numInputs)
        { i := add(i, 1) }
        {
          mstore(add(sigData, add(34, offset)), mload(add(txData, add(34, offset))))
          mstore8(add(sigData, add(66, offset)), byte(0, mload(add(txData, add(66, offset)))))
          offset := add(offset, add(33,65))
        }
      mstore(add(sigData, add(34, offset)), mload(add(txData, add(34, offset))))
      offset := add(offset, 32)
      mstore(add(sigData, add(34, offset)), mload(add(txData, add(34, offset))))
    }
  }

}