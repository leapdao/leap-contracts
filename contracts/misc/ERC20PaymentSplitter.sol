/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */
pragma solidity 0.5.2;

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

contract ERC20PaymentSplitter {

  address public payerAddr;

  constructor(address _payerAddr) public {
    payerAddr = _payerAddr;
  }

  modifier onlyPayer() {
    require(msg.sender == payerAddr, "Only payer can call");
    _;
  }

 /**
  * Transfers given token to multiple recipients as specified by _recepients and _splits arrays
  *
  * @dev This contract should have enough allowance of _tokenAddr from _payerAddr
  * @param _recipients Array of payment recipients
  * @param _splits Array of amounts for _tokenAddr ERC20 to transfer to corresponding recipient.
  * @param _tokenAddr ERC20 token used for payment unit
  */
  function split(
    address[] memory _recipients,
    uint256[] memory _splits,
    address _tokenAddr
  ) public onlyPayer {
    require(_recipients.length == _splits.length, "splits and recipients should be of the same length");
    IERC20 token = IERC20(_tokenAddr);
    for (uint i = 0; i < _recipients.length; i++) {
      token.transferFrom(payerAddr, _recipients[i], _splits[i]);
    }
  }
}