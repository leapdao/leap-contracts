pragma solidity 0.5.2;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";

contract ERC20Mint is ERC20 {
  modifier onlyMinter() {
    require(msg.sender == 0x0000000000000000000000000000000000000001);
    _;
  }

  function mint(address _to, uint256 _tokenId) public onlyMinter {
    super._mint(_to, _tokenId);
  }
}
