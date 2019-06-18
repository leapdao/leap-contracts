
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

import "./ExitHandler.sol";
import "./Bridge.sol";
import "./TxLib.sol";

contract FastExitHandler is ExitHandler {

  struct Data {
    uint32 timestamp;
    bytes32 txHash;
    uint64 txPos;
    bytes32 utxoId;
  }

  function startBoughtExit(
    bytes32[] memory _youngestInputProof, bytes32[] memory _proof,
    uint8 _outputIndex, uint8 _inputIndex, bytes32[] memory signedData
  ) public payable {
    require(msg.value >= exitStake, "Not enough ether sent to pay for exit stake");
    Data memory data;

    (,data.timestamp) = bridge.periods(_proof[0]);
    require(data.timestamp > 0, "The referenced period was not submitted to bridge");

    (, data.timestamp) = bridge.periods(_youngestInputProof[0]);
    require(data.timestamp > 0, "The referenced period was not submitted to bridge");

    // check exiting tx inclusion in the root chain block
    bytes memory txData;
    (data.txPos, data.txHash, txData) = TxLib.validateProof(32 * (_youngestInputProof.length + 2) + 96, _proof);

    // parse exiting tx and check if it is exitable
    TxLib.Tx memory exitingTx = TxLib.parseTx(txData);
    TxLib.Output memory out = exitingTx.outs[_outputIndex];
    data.utxoId = bytes32(uint256(_outputIndex) << 120 | uint120(uint256(data.txHash)));

    (uint256 buyPrice, bytes32 utxoIdSigned, address signer) = unpackSignedData(signedData);

    require(!isNft(out.color), "Can not fast exit NFTs");
    require(out.owner == address(this), "Funds were not sent to this contract");
    require(
      ecrecover(
        TxLib.getSigHash(txData),
        exitingTx.ins[0].v, exitingTx.ins[0].r, exitingTx.ins[0].s
      ) == signer,
      "Signer was not the previous owner of UTXO"
    );
    require(
      data.utxoId == utxoIdSigned,
      "The signed utxoid does not match the one in the proof"
    );

    require(out.value > 0, "UTXO has no value");
    require(exits[data.utxoId].amount == 0, "The exit for UTXO has already been started");
    require(!exits[data.utxoId].finalized, "The exit for UTXO has already been finalized");
    require(exitingTx.txType == TxLib.TxType.Transfer, "Can only fast exit transfer tx");

    uint256 priority;
    // check youngest input tx inclusion in the root chain block
    bytes32 inputTxHash;
    (data.txPos, inputTxHash,) = TxLib.validateProof(128, _youngestInputProof);
    require(
      inputTxHash == exitingTx.ins[_inputIndex].outpoint.hash,
      "Input from the proof is not referenced in exiting tx"
    );

    if (isNft(out.color)) {
      priority = (nftExitCounter << 128) | uint128(uint256(data.utxoId));
      nftExitCounter++;
    } else {
      priority = getERC20ExitPriority(data.timestamp, data.utxoId, data.txPos);
    }

    tokens[out.color].addr.transferFrom(msg.sender, signer, buyPrice);

    tokens[out.color].insert(priority);

    exits[data.utxoId] = Exit({
      owner: msg.sender,
      color: out.color,
      amount: out.value,
      finalized: false,
      stake: exitStake,
      priorityTimestamp: data.timestamp,
      tokenData: out.stateRoot
    });
    emit ExitStarted(
      data.txHash,
      _outputIndex,
      out.color,
      out.owner,
      out.value
    );
  }

  function unpackSignedData(
    bytes32[] memory signedData
  ) internal pure returns (
    uint256 buyPrice, bytes32 utxoId, address signer
  ) {
    utxoId = signedData[0];
    buyPrice = uint256(signedData[1]);
    bytes32 r = signedData[2];
    bytes32 s = signedData[3];
    uint8 v = uint8(uint256(signedData[4]));
    // solium-disable-next-line
    bytes32 sigHash = keccak256(abi.encodePacked(
      "\x19Ethereum Signed Message:\n",
      uint2str(64),
      utxoId,
      buyPrice
    ));
    signer = ecrecover(sigHash, v, r, s); // solium-disable-line arg-overflow
  }

  // https://github.com/oraclize/ethereum-api/blob/master/oraclizeAPI_0.5.sol#L886
  // solium-disable-next-line security/no-assign-params
  function uint2str(uint _i) internal pure returns (string memory _uintAsString) {
    if (_i == 0) {
      return "0";
    }
    uint j = _i;
    uint len;
    while (j != 0) {
      len++;
      j /= 10;
    }
    bytes memory bstr = new bytes(len);
    uint k = len - 1;
    while (_i != 0) {
      bstr[k--] = byte(uint8(48 + _i % 10));
      _i /= 10;
    }
    return string(bstr);
  }
}