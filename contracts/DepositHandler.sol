
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

import "./Vault.sol";
import "./Bridge.sol";

contract DepositHandler is Vault {

  event NewDeposit(
    uint32 indexed depositId, 
    address indexed depositor, 
    uint256 indexed color, 
    uint256 amount
  );
  event MinGasPrice(uint256 minGasPrice);

  struct Deposit {
    uint64 time;
    uint16 color;
    address owner;
    uint256 amount;
  }

  uint32 public depositCount;
  uint256 public minGasPrice;

  mapping(uint32 => Deposit) public deposits;

  function setMinGasPrice(uint256 _minGasPrice) public ifAdmin {
    minGasPrice = _minGasPrice;
    emit MinGasPrice(minGasPrice);
  }

  function _deposit(address _owner, uint256 _amountOrTokenId, uint16 _color) internal {
    require(_owner == msg.sender, "trying to deposit other token");
    TransferrableToken token = tokens[_color].addr;
    require(address(token) != address(0), "Token color not registered");
    require(_amountOrTokenId > 0 || _color > 32769, "no 0 deposits for fungible tokens");
    token.transferFrom(_owner, address(this), _amountOrTokenId);

    bytes32 tipHash = bridge.tipHash();
    uint256 timestamp;
    (, timestamp) = bridge.periods(tipHash);

    depositCount++;
    deposits[depositCount] = Deposit({
      time: uint32(timestamp),
      owner: _owner,
      color: _color,
      amount: _amountOrTokenId
    });
    emit NewDeposit(
      depositCount, 
      _owner, 
      _color, 
      _amountOrTokenId
    );
  }

   /**
   * @notice Add to the network `(_amountOrTokenId)` amount of a `(_color)` tokens
   * or `(_amountOrTokenId)` token id if `(_color)` is NFT.
   * @dev Token should be registered with the Bridge first.
   * @param _owner Account to transfer tokens from
   * @param _amountOrTokenId Amount (for ERC20) or token ID (for ERC721) to transfer
   * @param _color Color of the token to deposit
   */
  function deposit(address _owner, uint256 _amountOrTokenId, uint16 _color) public {
    _deposit(_owner, _amountOrTokenId, _color);
  }

  function depositBySender(uint256 _amountOrTokenId, uint16 _color) public {
    _deposit(msg.sender, _amountOrTokenId, _color);
  }

  // solium-disable-next-line mixedcase
  uint256[50] private ______gap;
}