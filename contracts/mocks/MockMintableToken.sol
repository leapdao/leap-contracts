pragma solidity 0.4.24;

import "../MintableToken.sol";

contract MockMintableToken is MintableToken {
  string public constant name = "MockMintableToken";
  string public constant symbol = "MOCK";
  uint8 public constant decimals = 8;

  uint256 public constant INITIAL_SUPPLY = 10000 * (10 ** uint256(decimals));

  /**
   * @dev Constructor that gives msg.sender all of existing tokens.
   */
  constructor() public {
    totalSupply_ = INITIAL_SUPPLY;
    balances[msg.sender] = INITIAL_SUPPLY;
    emit Transfer(0x0, msg.sender, INITIAL_SUPPLY);
  }
}