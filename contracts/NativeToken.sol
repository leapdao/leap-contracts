pragma solidity 0.4.24;

import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";
import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20Burnable.sol";

/**
 * @title NativeToken
 * @dev Simple mintable ERC20 Token, where all tokens are pre-assigned to the creator.
 * Note they can later distribute these tokens as they wish using `transfer` and other
 * `StandardToken` functions.
 */

contract NativeToken is ERC20Mintable, ERC20Burnable {

  bytes32 public name;
  bytes32 public symbol;
  uint256 public decimals;

  constructor(bytes32 _name, bytes32 _symbol, uint256 _decimals) public {
    name = _name;
    symbol = _symbol;
    decimals = _decimals;
  }

}
