pragma solidity 0.4.21;

import "./SafeMath.sol";
  
contract ParsecBridge {
  using SafeMath for uint256;
  
  uint256 constant epochLength = 8; // max number of operators with stake, also length of 1 epoche in blocks
  bytes32 constant genesis = 0x4920616d207665727920616e6772792c20627574206974207761732066756e21; // "I am very angry, but it was fun!" @victor
  uint256 totalSupply = 100000;

  struct Block {
    bytes32 parent; // the id of the parent node
    uint64 height;  // the hight this block is stored at
    uint32 parentIndex; //  the position of this node in the Parent's children list
    address operator; // the operator that submitted the block
    bytes32[] children; // unordered list of children below this node
    // more node attributes here
  }
  mapping(bytes32 => Block) public chain;
  
  struct Operator {
    uint256 stakeAmount; // amount of staken tokens
  }
  mapping(address => Operator) public operators;

  bytes32 public tipHash;    // hash of first block that has extended chain to some hight

  // ["0xca35b7d915458ef540ade6068dfe2f44e8fa733c", "0x14723a09acff6d2a60dcdf7aa4aff308fddc160c", "0x583031d1113ad414f02576bd6afabfb302140225"]
  address c = 0xca35b7d915458ef540ade6068dfe2f44e8fa733c;
  address d = 0x14723a09acff6d2a60dcdf7aa4aff308fddc160c;
  address e = 0x583031d1113ad414f02576bd6afabfb302140225;
  // operators
  // C = 3
  // D = 1
  // E = 5
  // block structure
  //                 /-> b[5,E]                     - 3
  // b[0,D] -> b[1,C] -> b[6,E] -> b[7,E]           - 4
  //                 \-> b[2,D] -> b[3,D] -> b[4,D] - 2

  function ParsecBridge() public {
    operators[c] = Operator({stakeAmount: 3000});
    operators[d] = Operator({stakeAmount: 1000});
    operators[e] = Operator({stakeAmount: 5000});
      
      
    Block memory genBlock;
    // b[0,D]
    genBlock.parent = genesis;
    genBlock.operator = d;
    genBlock.height = 0;
    tipHash = keccak256(genesis, uint64(0), bytes32(1));
    chain[tipHash] = genBlock;
    
    // b[1,C]
    genBlock.parent = tipHash;
    genBlock.operator = c;
    genBlock.height = 1;
    tipHash = keccak256(tipHash, uint64(1), bytes32(1));
    chain[genBlock.parent].children.push(tipHash);
    chain[tipHash] = genBlock;
    
    // b[5,E]
    genBlock.parent = tipHash;
    genBlock.operator = e;
    genBlock.height = 2;
    bytes32 b5Hash = keccak256(tipHash, uint64(2), bytes32(0));
    chain[genBlock.parent].children.push(b5Hash);
    chain[b5Hash] = genBlock;
    
    // b[6,E]
    genBlock.parent = tipHash;
    genBlock.operator = e;
    genBlock.height = 2;
    bytes32 b6Hash = keccak256(tipHash, uint64(2), bytes32(1));
    chain[genBlock.parent].children.push(b6Hash);
    chain[b6Hash] = genBlock;
    
    // b[2,D]
    genBlock.parent = tipHash;
    genBlock.operator = d;
    genBlock.height = 2;
    tipHash = keccak256(tipHash, uint64(2), bytes32(2));
    chain[genBlock.parent].children.push(tipHash);
    chain[tipHash] = genBlock;
    
    // b[7,E]
    genBlock.parent = b6Hash;
    genBlock.operator = e;
    genBlock.height = 3;
    bytes32 b7Hash = keccak256(b6Hash, uint64(3), bytes32(1));
    chain[genBlock.parent].children.push(b7Hash);
    chain[b7Hash] = genBlock;
    
    // b[3,D]
    genBlock.parent = tipHash;
    genBlock.operator = d;
    genBlock.height = 3;
    tipHash = keccak256(tipHash, uint64(3), bytes32(2));
    chain[genBlock.parent].children.push(tipHash);
    chain[tipHash] = genBlock;
    
    // b[4,D]
    genBlock.parent = tipHash;
    genBlock.operator = d;
    genBlock.height = 4;
    tipHash = keccak256(tipHash, uint64(4), bytes32(2));
    chain[genBlock.parent].children.push(tipHash);
    chain[tipHash] = genBlock;

  }
  
  function updateRewards(bytes32[] _data, address operator) internal constant returns(bytes32[] data) {
    // check if operator still has allowance
    // if yes, add to operator and to total
    // return data
  }

  // data = [winnerHash, claimCountTotal, operator, operator ...]
  // operator: 1b claimCountByOperator - 10b 0x - 1b stake - 20b address
  function dfs(bytes32[] _data, bytes32 _nodeHash) internal constant returns(bytes32[] data) {
    Block memory node = chain[_nodeHash];
    // visit this node
    data = updateRewards(_data, node.operator);
    // more tree to walk
    if (node.children.length > 0) {
      bytes32[][] memory options = new bytes32[][](_data.length);
      for (uint i = 0; i < node.children.length; i++) {
        options[i] = dfs(data, node.children[i]);
        // compare options,
        // return the best
        if (uint256(options[i][1]) >= uint256(data[1])) {
          data[0] = options[i][0];
          data[1] = options[i][1];
        }
      }
    } 
    // else - reached a tip
    // return data
  }

  /*
   * todo
   */    
  function getTip(address[] _operators) public constant returns (bytes32, uint256) {
    // find consensus horizon
    bytes32 consensusHorizon = chain[tipHash].parent;
    uint256 depth = (chain[tipHash].height < epochLength) ? 0 : chain[tipHash].height - epochLength;
    while(chain[consensusHorizon].height > depth) {
      consensusHorizon = chain[consensusHorizon].parent;        
    }
    // create data structure for depth first search
    bytes32[] memory data = new bytes32[](_operators.length + 2);
    for (uint i = 2; i < _operators.length + 2; i++) {
      data[i] = bytes32(((operators[_operators[i-2]].stakeAmount * 100) / totalSupply) << 160) | bytes32(_operators[i-2]);
    }
    // run search
    data = dfs(data, consensusHorizon);
    // return result
    return (data[0], uint256(data[1]));
  }

}
