
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

pragma solidity 0.5.2;

import "../node_modules/openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "./proxies/AdminableProxy.sol";

contract MinGov is Ownable {
  
  uint256 public proposalTime;
  uint256 public first;
  uint256 public size;
  
  struct Proposal {
    address subject;
    uint32 created;
    bool canceled;
    bytes msgData;
  }
  
  mapping(uint256 => Proposal) public proposals;
  
  event NewProposal(uint256 indexed proposalId, address indexed subject, bytes msgData);
  event Execution(uint256 indexed proposalId, address indexed subject, bytes msgData);
  
  constructor(uint256 _proposalTime) public {
    proposalTime = _proposalTime;
    first = 1;
    size = 0;
  }

  function propose(address _subject, bytes memory _msgData) public onlyOwner {
    require(size < 5);
    proposals[first + size] = Proposal(
      _subject,
      uint32(now),
      false,
      _msgData
    );
    emit NewProposal(first + size, _subject, _msgData);
    size++;
  }
  
  function cancel(uint256 _proposalId) public onlyOwner() {
    Proposal storage prop = proposals[_proposalId];
    require(prop.created > 0);
    require(prop.canceled == false);
    prop.canceled = true;
  }

  function withdrawTax(address _token) public onlyOwner {
    IERC20 token = IERC20(_token);
    token.transfer(owner(), token.balanceOf(address(this)));
  }

  function finalize() public {
    for (uint256 i = first; i < first + size; i++) {
      Proposal memory prop = proposals[i];
      if (prop.created + proposalTime <= now) {
        if (!prop.canceled) {
          bool rv;
          if ( getSig(prop.msgData) == 0x8f283970 || // changeAdmin(address)
            getSig(prop.msgData) == 0x3659cfe6 // upgradeTo(address)
          ) {
            // this changes proxy parameters 
            (rv, ) = prop.subject.call(prop.msgData);
          } else {
            // this changes governance parameters to the implementation
            rv = AdminableProxy(address(uint160(prop.subject))).applyProposal(prop.msgData);
          }
          if (rv) {
            emit Execution(i, prop.subject, prop.msgData);
          }
        }
        delete proposals[i];
        first++;
        size--;
      }
    }
  }

  // proxy function to manage validator slots without governance delay
  function setSlot(uint256 _slotId, address, bytes32) public onlyOwner {
    // extract subject
    address payable subject = address(uint160(_slotId >> 96));
    // strip out subject from data
    bytes memory msgData = new bytes(100);
    assembly {
      calldatacopy(add(msgData, 32), 0, 4)
      calldatacopy(add(msgData, 56), 24, 76)
    }
    // call subject
    require(AdminableProxy(subject).applyProposal(msgData), "setSlot call failed");
  }

  function getSig(bytes memory _msgData) internal pure returns (bytes4) {
    return bytes4(_msgData[3]) >> 24 | bytes4(_msgData[2]) >> 16 | bytes4(_msgData[1]) >> 8 | bytes4(_msgData[0]);
  }

}