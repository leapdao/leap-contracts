
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity ^0.5.12;

import "./Vault.sol";
import "./Bridge.sol";
import "./IERC1948.sol";

contract DepositHandler is Vault {

  event NewDeposit(
    uint32 indexed depositId,
    address indexed depositor,
    uint256 indexed color,
    uint256 amount
  );
  event MinGasPrice(uint256 minGasPrice);
  // Support for NSTs
  event NewDepositV2(
    uint32 indexed depositId,
    address indexed depositor,
    uint256 indexed color,
    uint256 amount,
    bytes32 data
  );

  struct Deposit {
    uint64 time;
    uint16 color;
    address owner;
    uint256 amount;
  }

  uint32 public depositCount;
  uint256 public minGasPrice;

  mapping(uint32 => Deposit) public deposits;
  mapping(uint32 => bytes32) public tokenData;

  function setMinGasPrice(uint256 _minGasPrice) public ifAdmin {
    minGasPrice = _minGasPrice;
    emit MinGasPrice(minGasPrice);
  }

 /**
  * @notice Add to the network `(_amountOrTokenId)` amount of a `(_color)` tokens
  * or `(_amountOrTokenId)` token id if `(_color)` is NFT.
  *
  * !!!! DEPRECATED, use depositBySender() instead !!!!
  *
  * @dev Token should be registered with the Bridge first.
  * @param _owner Account to transfer tokens from
  * @param _amountOrTokenId Amount (for ERC20) or token ID (for ERC721) to transfer
  * @param _color Color of the token to deposit
  */
  function deposit(address _owner, uint256 _amountOrTokenId, uint16 _color) public {
    require(_owner == msg.sender, "owner different from msg.sender");
    _deposit(_amountOrTokenId, _color);
  }

  function depositBySender(uint256 _amountOrTokenId, uint16 _color) public {
    _deposit(_amountOrTokenId, _color);
  }

  function _deposit(uint256 _amountOrTokenId, uint16 _color) internal {
    TransferrableToken token = tokens[_color].addr;
    require(address(token) != address(0), "Token color already registered");
    require(_amountOrTokenId > 0 || _color > 32769, "no 0 deposits for fungible tokens");

    bytes32 _tokenData;

    if (_color >= NST_FIRST_COLOR) {
      IERC1948 nst = IERC1948(address(token));
      // XXX: maybe we need a 'support' getter here, to announce support?
      _tokenData = nst.readData(_amountOrTokenId);
    }

    token.transferFrom(msg.sender, address(this), _amountOrTokenId);

    bytes32 tipHash = bridge.tipHash();
    uint256 timestamp;
    (, timestamp,,) = bridge.periods(tipHash);

    depositCount++;
    deposits[depositCount] = Deposit({
      time: uint32(timestamp),
      owner: msg.sender,
      color: _color,
      amount: _amountOrTokenId
    });

    if (_color >= NST_FIRST_COLOR) {
      tokenData[depositCount] = _tokenData;

      emit NewDepositV2(
        depositCount,
        msg.sender,
        _color,
        _amountOrTokenId,
        _tokenData
      );
    } else {
      emit NewDeposit(
        depositCount,
        msg.sender,
        _color,
        _amountOrTokenId
      );
    }
  }

  // solium-disable-next-line mixedcase
  uint256[49] private ______gap;
}