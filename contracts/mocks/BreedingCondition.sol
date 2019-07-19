pragma solidity ^0.5.2;

import "../IERC1949.sol";

contract BreedingCondition {
  address constant nftAddr = 0x1233333333333333333333333333333333333321;

  function breed(uint256 _queenId, address _receiver, bytes32 _workerData) public {
    IERC1949 nst = IERC1949(nftAddr);
    // breeding conditions here
    nst.breed(_queenId, _receiver, _workerData);
  }

}