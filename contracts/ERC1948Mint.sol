pragma solidity 0.5.2;

import "openzeppelin-solidity/contracts/token/ERC721/ERC721.sol";
import "./IERC1948.sol";


contract ERC1948Mint is IERC1948, ERC721 {
  mapping(uint256 => bytes32) data;

  modifier onlyMinter() {
    require(msg.sender == 0x0000000000000000000000000000000000000001);
    _;
  }

  function mint(address _to, uint256 _tokenId, bytes32 _newData) public onlyMinter {
    super._mint(_to, _tokenId);

    emit DataUpdated(_tokenId, data[_tokenId], _newData);
    data[_tokenId] = _newData;
  }

  function readData(uint256 _tokenId) public view returns (bytes32) {
    require(_exists(_tokenId));
    return data[_tokenId];
  }

  function writeData(uint256 _tokenId, bytes32 _newData) public {
    require(msg.sender == ownerOf(_tokenId));
    emit DataUpdated(_tokenId, data[_tokenId], _newData);
    data[_tokenId] = _newData;
  }
}
