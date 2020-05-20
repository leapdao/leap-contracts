pragma solidity ^0.5.12;

import "openzeppelin-solidity/contracts/token/ERC721/ERC721.sol";

contract ERC721Mint is ERC721 {
  modifier onlyMinter() {
    require(msg.sender == 0x0000000000000000000000000000000000000001, "minter not runtime");
    _;
  }

  function mint(address _to, uint256 _tokenId) public onlyMinter {
    super._mint(_to, _tokenId);
  }
}
