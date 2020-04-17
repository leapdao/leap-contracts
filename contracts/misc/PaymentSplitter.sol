/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */
pragma solidity 0.5.2;

import "../../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";

contract PaymentSplitter {
  using SafeMath for uint256;

 /**
  * Transfers ether to multiple recipients as specified by _recepients and _splits arrays
  *
  * @param _recipients Array of payment recipients
  * @param _splits Array of share amount to transfer to corresponding recipient. Values can be anything as long as ratio is correct — e.g. [5,5,5] will split the value equally. If you want to transfer specific amounts in wei, specify _splits in wei. The splits should sum up to the `msg.value` in this case. The remainder, if any, will be sent to the last recipient
  */
  function split(
    address payable[] memory _recipients,
    uint256[] memory _splits
  ) public payable {
    require(_recipients.length > 0, "no data for split");
    require(_recipients.length == _splits.length, "splits and recipients should be of the same length");

    uint256 sumShares = 0;
    for (uint i = 0; i < _recipients.length; i++) {
      sumShares = sumShares.add(_splits[i]);
    }

    for (uint i = 0; i < _recipients.length - 1; i++) {
      _recipients[i].transfer(msg.value.mul(_splits[i]).div(sumShares));
    }
    // flush the rest, so that we don't have rounding errors or stuck funds
    _recipients[_recipients.length - 1].transfer(address(this).balance);
  }

}
