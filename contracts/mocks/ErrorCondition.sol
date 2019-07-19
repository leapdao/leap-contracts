pragma solidity ^0.5.2;
import "openzeppelin-solidity/contracts/token/ERC721/IERC721.sol";

contract ErrorCondition {
  address constant tokenAddr = 0x1111111111111111111111111111111111111111;

  function fulfil(address _receiver, uint256 _tokenId) public {
    require(true == false, "error");
  }
}