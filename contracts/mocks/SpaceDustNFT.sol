/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */
pragma solidity 0.5.2;

import "../../node_modules/openzeppelin-solidity/contracts/token/ERC721/ERC721Metadata.sol";
import "../../node_modules/openzeppelin-solidity/contracts/access/roles/MinterRole.sol";

/**
 * @title SpaceDustNFT
 * @dev Simple ERC721 token mintable by whitelisted accounts
 */

contract SpaceDustNFT is ERC721Metadata, MinterRole {

  constructor() public ERC721Metadata("SpaceDustNFT", "SDST") MinterRole() {
  }

  function mint(
    address _to, 
    uint32 _size, 
    bool _isGlowing, 
    uint8 _color
  ) public onlyMinter {
    require(_size > 0);
    uint256 nftId = now << 41 | _size << 9 | _color << 1 | (_isGlowing ? 1 : 0);
    super._mint(_to, nftId);
  }

  function burn(uint256 _tokenId) public onlyMinter {
    super._burn(ownerOf(_tokenId), _tokenId);
  }
}

