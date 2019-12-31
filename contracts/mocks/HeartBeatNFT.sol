/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */
pragma solidity 0.5.2;

import "../../node_modules/openzeppelin-solidity/contracts/token/ERC721/ERC721Full.sol";
import "../../node_modules/openzeppelin-solidity/contracts/access/roles/MinterRole.sol";

/**
 * @title HeartBeatNFT
 * @dev Simple ERC721 token mintable by whitelisted accounts
 */

contract HeartBeatNFT is ERC721Full, MinterRole {

  constructor() public ERC721Full("HeartBeatNFT", "HBT") MinterRole() {
  }

  function mint(address _to, uint256 slotId) public onlyMinter {
    super._mint(_to, slotId);
  }

  function burn(uint256 _tokenId) public onlyMinter {
    super._burn(ownerOf(_tokenId), _tokenId);
  }
}

