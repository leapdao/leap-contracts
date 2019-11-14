pragma solidity ^0.5.2;

import "../IExitHandler.sol";

contract SpendingCondition {

  // startExit
  // triggers the exit of funds to a contract on parent chain
  function startExit(
    bytes32[] memory _youngestInputProof,
    bytes32[] memory _proof,
    uint8 _outputIndex,
    uint8 _inputIndex,
    address _handlerAddr
  ) public payable {
    IExitHandler exitHandler = IExitHandler(_handlerAddr);
    exitHandler.startExit.value(msg.value)(
      _youngestInputProof,
      _proof,
      _outputIndex,
      _inputIndex
    );
  }
}