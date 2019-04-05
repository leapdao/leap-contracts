pragma solidity 0.5.2;

import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";

contract SunDAI is ERC20 {
  
  bytes32 public name;
  bytes32 public symbol;
  uint8 public decimals;

  address public bridgeAddr;
  ERC20 public dai;
  mapping(address => uint256) public daiBalance;

  constructor(address _daiAddr, address _bridgeAddr, bytes32 _name, bytes32 _symbol) {
    dai = ERC20(_daiAddr);
    bridgeAddr = _bridgeAddr;
    _decimals = 18;
    name = _name;
    symbol = _symbol;
  }

  // 1. DAI is pulled into the contract, and record created
  // 2. sunDAI are minted in amount of DAI deposited
  // 3. sunDAI transfered to the Bridge
  function _pullAndMint(address from, address to, uint256 value) internal {
    dai.transferFrom(from, address(this), value);
    daiBalance[from] = daiBalance[from].add(value);
    _mint(bridgeAddr, value);
  }

  function _transferFrom(address from, address to, uint256 value) internal {
    _transfer(from, to, value);

    // only check allowance if other caller than bridge
    if (to != bridgeAddr) {
      _approve(from, msg.sender, _allowed[from][msg.sender].sub(value));
    }
  }

  // +------+         +--------+       +--------+
  // |  DAI |         | sunDAI |       | Bridge |
  // +---+--+         +----+---+       +----+---+
  //     |                 |                |
  //     |                 |                |
  //     |                 | transferFrom   |
  //     |  transferFrom   | <------------+ |
  //     | <------------+  |                |
  //     |                 | mint           |
  //     | +------------>  | +--+           |
  //     |                 |    |           |
  //     |                 | <--+           |
  //     |                 |                |
  //     |                 | transfer       |
  //     |                 | +----------->  |
  //     |                 |                |
  function transferFrom(address from, address to, uint256 value) public returns (bool) {
    uint256 needToMint = 0;
    if (_balances[from] < value) {
      uint256 needToMint = value.sub(_balances[from]);
      _pullAndMint(from, to, needToMint);
    }
    if (needToMint < value) {
      _transferFrom(from, to, value.sub(needToMint));
    }
    return true;
  }

  function burn(address owner) public {
    require(daiBalance[owner] > 0);
    uint256 amount = _balances[owner];
    if(daiBalance[owner] < amount) {
      amount = daiBalance[owner];
    }
    daiBalance[owner] = daiBalance[owner].sub(amount);
    _burnFrom(owner, amount);
    require(dai.transfer(owner, amount), "dai transfer failed");
  }

  function burnSender() public {
    _burn(msg.sender);
  }

}
