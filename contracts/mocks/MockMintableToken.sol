pragma solidity 0.4.24;

import "zos-lib/contracts/Initializable.sol";
import "../MintableToken.sol";

contract MockMintableToken is Initializable, MintableToken {
  string public constant name = "MockMintableToken";
  string public constant symbol = "MOCK";
  uint8 public constant decimals = 8;

  uint256 public constant INITIAL_SUPPLY = 10000 * (10 ** uint256(decimals));

  /**
   * @dev Constructor that gives msg.sender all of existing tokens.
   */
  function initialize() public initializer {
    MintableToken.initialize();
    _mint(msg.sender,INITIAL_SUPPLY);
  }
}