/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */
pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/token/ERC721/ERC721Token.sol";
import "openzeppelin-solidity/contracts/access/Whitelist.sol";

/**
 * @title SpaceDustNFT
 * @dev Simple ERC721 token mintable by whitelisted accounts
 */

contract SpaceDustNFT is ERC721Token, Whitelist {

  constructor() public ERC721Token("SpaceDustNFT", "SDST") {
    addAddressToWhitelist(msg.sender);
  }

  function mint(
    address _to, 
    uint32 _size, 
    bool _isGlowing, 
    uint8 _color
  ) public onlyIfWhitelisted(msg.sender) {
    require(_size > 0);
    // solium-disable-next-line security/no-block-members
    uint256 nftId = now << 41 | _size << 9 | _color << 1 | (_isGlowing ? 1 : 0);
    super._mint(_to, nftId);
  }

  function burn(uint256 _tokenId) public onlyIfWhitelisted(msg.sender) {
    super._burn(ownerOf(_tokenId), _tokenId);
  }
}

