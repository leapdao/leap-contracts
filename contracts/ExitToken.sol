pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/token/ERC721/ERC721BasicToken.sol";
import "openzeppelin-solidity/contracts/access/Whitelist.sol";

contract ExitToken is ERC721BasicToken, Whitelist {

  constructor() public {   
    addAddressToWhitelist(msg.sender);
  }

  function mint(address _to, uint256 _tokenId) public onlyIfWhitelisted(msg.sender) {
    super._mint(_to, _tokenId);
  }
}