
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */
 
pragma solidity ^0.5.2;

import "openzeppelin-solidity/contracts/token/ERC721/ERC721.sol";
import "./IERC1537.sol";

contract ERC1537 is IERC1537, ERC721 {

  mapping(uint256 => bytes32) data;

  function mint(address _to, uint256 _tokenId) public {
    super._mint(_to, _tokenId);
  }

  function burn(uint256 _tokenId) public {
    super._burn(ownerOf(_tokenId), _tokenId);
    delete(data[_tokenId]);
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