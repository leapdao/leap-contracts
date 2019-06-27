pragma solidity 0.5.2;

import "./ERC1948.sol";
import "./IERC1949.sol";

/**
 * @dev Implementation of the `IERC1949` interface.
 *
 * An NFT token contract implementing a delegate authorization model for minting.
 * Delegate tokens give minting rights to holders of such token. Delegate token 
 * holders can mint regular tokens that don't convey minting right.
 *
 * The delegate authorization model enables deferred mining of tokens, if a delegate
 * token is deposited into a side-/child-chain bridge. The rules of minting have to
 * be enforced through contracts/predicates on the side-/child-chain and are not part
 * of this implementation.
 */
contract ERC1949 is IERC1949, ERC1948 {
  uint256 public delegateCounter = 0;
  mapping(address => uint256) delegateOwners;

  // Token name
  string public name = "DeferredMinter123";

  // Token symbol
  string public symbol = "DM1";

  /**
   * @dev mints a new delegate 
   * @param _to The token to read the data off.
   */
  function mintDelegate(address _to) public {
    delegateCounter += 1;
    uint256 delegateId = uint256(keccak256(abi.encodePacked(address(this), delegateCounter)));
    super._mint(_to, delegateId);
    delegateOwners[_to] = delegateId;
    emit DataUpdated(delegateId, data[delegateId], bytes32(uint256(1)));
    data[delegateId] = bytes32(uint256(1));
  }

  modifier onlyDelegateOwner(address to) {
    require(
      (delegateOwners[msg.sender] > 0) ||
      ((delegateOwners[to] > 0) && _isApprovedOrOwner(msg.sender, delegateOwners[to])),
      "sender not queen owner nor approved"
    );
    _;
  }

  function breed(uint256 tokenId, address to, bytes32 tokenData) external onlyDelegateOwner(to) {
    super._mint(to, tokenId);
    emit DataUpdated(tokenId, data[tokenId], tokenData);
    data[tokenId] = tokenData;
  }

}
