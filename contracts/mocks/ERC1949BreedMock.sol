pragma solidity 0.5.2;

import "../ERC1949Breed.sol";


contract ERC1949BreedMock is ERC1949Breed {

  function mint(address _to, uint256 _tokenId, bytes32 _newData) public {
    super._mint(_to, _tokenId);

    emit DataUpdated(_tokenId, data[_tokenId], _newData);
    data[_tokenId] = _newData;
  }

}
