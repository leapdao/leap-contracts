pragma solidity 0.5.2;

import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20Detailed.sol";
import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";
import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20Burnable.sol";

/**
 * @title NativeToken
 * @dev Simple mintable ERC20 Token, where all tokens are pre-assigned to the creator.
 * Note they can later distribute these tokens as they wish using `transfer` and other
 * `StandardToken` functions.
 */

contract NativeToken is ERC20Detailed, ERC20Mintable, ERC20Burnable {

  constructor(string memory _name, string memory _symbol, uint8 _decimals) 
    public ERC20Detailed(_name, _symbol, _decimals) {
  }

}
