pragma solidity 0.5.2;

import "./ERC1948Mint.sol";
import "./IERC1949.sol";


contract ERC1949 is IERC1949, ERC1948Mint {
  uint256 public queenCounter = 0;
  mapping(address => uint256) queenOwners;

  function mintQueen(address _to) public {
    queenCounter += 1;
    uint256 queenId = uint256(keccak256(abi.encodePacked(address(this), queenCounter)));
    super._mint(_to, queenId);
    queenOwners[_to] = queenId;
    emit DataUpdated(queenId, data[queenId], bytes32(uint256(1)));
    data[queenId] = bytes32(uint256(1));
  }

  modifier onlyQueenOwner() {
    require(queenOwners[msg.sender] > 0, "sender not queen owner");
    _;
  }

  function breed(uint256 _workerId, bytes32 _workerData) public onlyQueenOwner() {
    super._mint(msg.sender, _workerId);
    emit DataUpdated(_workerId, data[_workerId], _workerData);
    data[_workerId] = _workerData;
  }

}
