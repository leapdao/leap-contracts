/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity ^0.5.12;

import "../node_modules/openzeppelin-solidity/contracts/token/ERC721/ERC721Full.sol";
import "../node_modules/openzeppelin-solidity/contracts/access/roles/MinterRole.sol";

/**
 * @title HeartbeatToken
 * @dev Simple ERC721 token mintable by whitelisted accounts
 */

contract HeartbeatToken is ERC721Full, MinterRole {

  constructor() public ERC721Full("Validator Heartbeat", "HBT") MinterRole() {
  }

  function mint(
    address _to,
    address _owner,
    uint8 _slotId
  ) public onlyMinter {
    uint256 nftId = now << 9 | uint256(_owner) << 8 | _slotId;
    super._mint(_to, nftId);
  }

  function burn(uint256 _tokenId) public onlyMinter {
    super._burn(ownerOf(_tokenId), _tokenId);
  }
}

