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

contract DelayedBreeder is ERC721Metadata, ERC1537, MinterRole {
  uint96 public queenCounter = 0;

  constructor() public ERC721Metadata("dBreed", "DBR") MinterRole() {
  }

  function mintQeen(address _to) public onlyMinter {
    queenCounter += 1;
    uint256 nftId = uint256(kechak256(address(this), queenCounter));
    super._mint(_to, nftId);
    data[nftId] = 0x01;
  }

}

