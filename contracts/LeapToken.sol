pragma solidity 0.4.24;

import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";
import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20Burnable.sol";

/**
 * @title LeapToken
 * @dev Simple mintable ERC20 Token, where all tokens are pre-assigned to the creator.
 * Note they can later distribute these tokens as they wish using `transfer` and other
 * `StandardToken` functions.
 */

contract LeapToken is ERC20Mintable, ERC20Burnable {

  string public constant name = "LeapToken";
  string public constant symbol = "LEAP";
  uint8 public constant decimals = 18;

  constructor() public {    
  }

}
