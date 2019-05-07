pragma solidity ^0.5.2;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";


/*
* workflow
* 1. worker deploys contract
* 1. worker finds reviewer and agrees on share
* 2. worker stakes 1/2 of bounty amount
* 3. worker gets bitten if bounty is stalling
* 6. worker or reviewer convince multisig to create approval, and pull funds in
* 7. reviewer pays out bounty
*
* problems:
* - 7 txns to complete bounty
* - worker will wait till last moment to deploy contract
*/
contract FastTrackBounty {
  using SafeMath for uint256;

  // mainnet
  IERC20 constant dai = IERC20(0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359);
  IERC20 constant leap = IERC20(0x78230E69d6e6449dB1E11904e0bD81C018454d7A);

  address multisig;
  address worker;
  address reviewer;
  uint256 stakeAmount;
  uint256 revShare;
  uint256 startDate;

  function details()  public view returns (address, address, address, uint256, uint256, uint256) {
    return (multisig, worker, reviewer, stakeAmount, revShare, startDate);
  }

  function stake(uint256 _stake, address _multi, uint256 _revShare, address _reviewer) public {
    require(stakeAmount == 0, "already funded");
    require(revShare > 0, "rev share too small");
    require(revShare < 50, "rev share too big");
    
    // pull stake
    dai.transferFrom(msg.sender, address(this), _stake);
    leap.transferFrom(msg.sender, address(this), _stake);
    
    startDate = now;
    worker = msg.sender;
    stakeAmount = _stake;
    multisig = _multi;
    revShare = _revShare;
    reviewer = _reviewer;
  }

  function bite() public {
    require(now >= startDate + 1 weeks, "not ripe yet");
    
    // bite stake
    dai.transfer(multisig, stakeAmount.div(3));
    leap.transfer(multisig, stakeAmount.div(3));

    startDate = startDate + 1 weeks;
  }

  // once the multisig has approved the bounty amount
  // it can be pulled into the contract
  function fund() public {
    // pull funds from multisig
    dai.transferFrom(multisig, address(this), stakeAmount.mul(2));
    leap.transferFrom(multisig, address(this), stakeAmount.mul(2));
  }

  function payout() public {
    require(msg.sender == reviewer, "sender not reviewer");
    
    // payout reviewer
    dai.transfer(reviewer, stakeAmount.mul(revShare).div(50));
    leap.transfer(reviewer, stakeAmount.mul(revShare).div(50));
    
    uint256 daiBal = dai.balanceOf(address(this));
    uint256 leapBal = leap.balanceOf(address(this));
    
    // payout worker
    dai.transfer(worker, daiBal);
    leap.transfer(worker, leapBal);

    selfdestruct(msg.sender);
  }
    
}
