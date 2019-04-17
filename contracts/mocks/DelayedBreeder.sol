/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */
pragma solidity 0.5.2;

import "../ERC1537.sol";
import "../../node_modules/openzeppelin-solidity/contracts/access/roles/MinterRole.sol";
import "./IDelayedBreeder.sol";

/**
 * @title SpaceDustNFT
 * @dev Simple ERC721 token mintable by whitelisted accounts
 */

contract DelayedBreeder is ERC1537, MinterRole, IDelayedBreeder {
  uint96 public queenCounter = 0;

  function mintQueen() public onlyMinter {
    queenCounter += 1;
    uint256 queenId = uint256(keccak256(abi.encodePacked(address(this), queenCounter)));
    super._mint(msg.sender, queenId);
    data[queenId] = bytes32(uint256(1));
  }

  function breed(uint256 _queenId, uint256 _workerId, address _to) public {
    require(ownerOf(_queenId) == msg.sender, "breed called by non-owner");
    uint256 breedCounter = uint256(readData(_queenId));
    require(breedCounter > 0 && breedCounter < 2 ** 32, "queenId not queen");
    require(_to != address(0), "owner should not be null");
    super._mint(_to, _workerId);
  }

}

