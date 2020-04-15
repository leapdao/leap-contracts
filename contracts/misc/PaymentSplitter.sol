/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */
pragma solidity 0.5.2;

contract PaymentSplitter {

 /**
  * Transfers given token to multiple recipients as specified by _recepients and _splits arrays
  *
  * @dev This contract should have enough allowance of _tokenAddr from _payerAddr
  * @param _recipients Array of payment recipients
  * @param _splits Array of amounts for _tokenAddr ERC20 to transfer to corresponding recipient.
  */
  function split(
    address payable[] memory _recipients,
    uint256[] memory _splits
  ) public payable {
    uint256 amount = msg.value;
    require(_recipients.length == _splits.length, "splits and recipients should be of the same length");

    uint256 sumShares = 0;
    for (uint i = 0; i < _recipients.length; i++) {
      sumShares += _splits[i];
    }

    for (uint i = 0; i < _recipients.length - 1; i++) {
      _recipients[i].transfer(amount * _splits[i] / sumShares);
    }
    // flush the rest, so that we don't have rounding errors or stuck funds
    _recipients[_recipients.length - 1].transfer(address(this).balance);
  }

}