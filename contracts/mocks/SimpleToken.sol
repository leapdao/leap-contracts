pragma solidity 0.5.2;

import "../../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "../LeapToken.sol";

/**
 * @title SimpleToken
 * @dev SimpleToken is a LeapToken with premine. Used for tests.
 */
contract SimpleToken is LeapToken {

  uint256 public constant INITIAL_SUPPLY = 10000 * (10 ** uint256(decimals));

  /**
   * @dev Constructor that gives msg.sender all of existing tokens.
   */
  constructor() public {
    _mint(msg.sender, INITIAL_SUPPLY);
  }

}
