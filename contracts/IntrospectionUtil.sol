/**
 * Copyright (c) 2017-present, Parsec Labs (parseclabs.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */
 
pragma solidity 0.4.24;

/*
* Based on https://github.com/ethereum/EIPs/blob/master/EIPS/eip-165.md
*/

library IntrospectionUtil {

  function isERC721(address _contract) internal view returns (bool) {
    uint256 success;
    uint256 result;
    
    (success, result) = tryCallGetApproved(_contract);
    return (success == 1) && (result == 0);
  }

  function tryCallGetApproved(address _contract) internal view returns (uint256 success, uint256 result) {
    bytes4 selector = bytes4(keccak256("getApproved(uint256)"));

    assembly {
        let x := mload(0x40)         // Find empty storage location using "free memory pointer"
        mstore(x, selector)        // Place signature at begining of empty storage
        mstore(add(x, 0x04), 0xffffffff)   // Place first argument directly next to signature

        success := staticcall(
                  30000,     // 30k gas
                  _contract,   // To addr
                  x,       // Inputs are stored at location x
                  0x20,      // Inputs are 32 bytes long
                  x,       // Store output over input (saves space)
                  0x20)      // Outputs are 32 bytes long

        result := mload(x)         // Load the result
    }
  }
}