pragma solidity ^0.5.12;

import "openzeppelin-solidity/contracts/token/ERC721/ERC721.sol";
import "./IERC1948.sol";


contract ERC1948Mint is IERC1948, ERC721 {
  mapping(uint256 => bytes32) data;

  modifier onlyMinter() {
    require(msg.sender == 0x0000000000000000000000000000000000000001, "minter not runtime");
    _;
  }

  function writeDataByReceipt(uint256 tokenId, bytes32 newData, bytes calldata sig) external {
    address signer = _ecRecoverPersonal(data[tokenId], newData, sig);
    require(signer == ownerOf(tokenId), "signer not matching");
    emit DataUpdated(tokenId, data[tokenId], newData);
    data[tokenId] = newData;
  }

  function mint(address _to, uint256 _tokenId, bytes32 _newData) public onlyMinter {
    super._mint(_to, _tokenId);

    emit DataUpdated(_tokenId, data[_tokenId], _newData);
    data[_tokenId] = _newData;
  }

  function readData(uint256 _tokenId) public view returns (bytes32) {
    require(_exists(_tokenId), "tokenId does not exist");
    return data[_tokenId];
  }

  function writeData(uint256 _tokenId, bytes32 _newData) public {
    require(msg.sender == ownerOf(_tokenId) || getApproved(_tokenId) == msg.sender, "no permission");
    emit DataUpdated(_tokenId, data[_tokenId], _newData);
    data[_tokenId] = _newData;
  }

  function _ecRecoverPersonal(bytes32 _before, bytes32 _after, bytes memory signature) internal pure returns (address) {
    // Check the signature length
    if (signature.length != 65) {
      return (address(0));
    }

    // Divide the signature in r, s and v variables
    bytes32 r;
    bytes32 s;
    uint8 v;

    // ecrecover takes the signature parameters, and the only way to get them
    // currently is to use assembly.
    // solhint-disable-next-line no-inline-assembly
    assembly {
      r := mload(add(signature, 0x20))
      s := mload(add(signature, 0x40))
      v := byte(0, mload(add(signature, 0x60)))
    }

    // EIP-2 still allows signature malleability for ecrecover(). Remove this possibility and make the signature
    // unique. Appendix F in the Ethereum Yellow paper (https://ethereum.github.io/yellowpaper/paper.pdf), defines
    // the valid range for s in (281): 0 < s < secp256k1n ÷ 2 + 1, and for v in (282): v ∈ {27, 28}. Most
    // signatures from current libraries generate a unique signature with an s-value in the lower half order.
    //
    // If your library generates malleable signatures, such as s-values in the upper range, calculate a new s-value
    // with 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141 - s1 and flip v from 27 to 28 or
    // vice versa. If your library also generates signatures with 0/1 for v instead 27/28, add 27 to v to accept
    // these malleable signatures as well.
    if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
      return address(0);
    }

    if (v != 27 && v != 28) {
      return address(0);
    }
    bytes32 sigHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n64", _before, _after));
    return ecrecover(sigHash, v, r, s); // solium-disable-line arg-overflow
  }

}
