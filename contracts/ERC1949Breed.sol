pragma solidity 0.5.2;

import "./ERC1948Mint.sol";


// this contract is intended for the leap-node execution environment
contract ERC1949Breed is ERC1948Mint {

  modifier onlyQueenOwner(uint256 _queenId) {
    require(ownerOf(_queenId) == msg.sender, "sender not queen owner");
    _;
  }

  function breed(uint256 _queenId, address _to, bytes32 _workerData) public onlyQueenOwner(_queenId) {
    uint256 counter = uint256(readData(_queenId));
    require(counter > 0, "queenId too low");
    require(counter < 4294967296, "queenId too high");  // 2 ^ 32 = 4294967296
    writeData(_queenId, bytes32(counter + 1));
    uint256 newId = uint256(keccak256(abi.encodePacked(_queenId, counter)));

    super._mint(_to, newId);
    emit DataUpdated(newId, data[newId], _workerData);
    data[newId] = _workerData;
  }

}
