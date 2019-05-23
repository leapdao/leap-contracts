const SparseMerkleTree = artifacts.require("SparseMerkleTree");
const SmtLib = require('./helpers/SmtLib.js');

contract("SparseMerkleTree", () => {
  const leafZero = '0x290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563';
  const leafOne = '0x1100000000000000000000000000000000000000000000000000000000000011';
  const leafTwo = '0x2200000000000000000000000000000000000000000000000000000000000022';

  it("should allow to verify proofs with single intersection at 1", async() => {
    const smt = await SparseMerkleTree.new();
    const tree = new SmtLib(64, {
        '0': leafOne,
        '1': leafTwo,
    });
    let rsp = await smt.getRoot(leafOne, 0, tree.createMerkleProof('0'));
    assert.equal(rsp, tree.root);
    rsp = await smt.getRoot(leafTwo, 1, tree.createMerkleProof('1'));
    assert.equal(rsp, tree.root);
    rsp = await smt.getRoot(leafZero, 2, tree.createMerkleProof('2'));
    assert.equal(rsp, tree.root);
  });

  it("should allow to verify proof with multiple intersections", async() => {
    const smt = await SparseMerkleTree.new();
    const leafThree = '0x3300000000000000000000000000000000000000000000000000000000000033';
    const tree = new SmtLib(64, {
        '123': leafOne,
        '256': leafTwo,
        '304': leafThree,
    });
    let rsp = await smt.getRoot(leafOne, 123, tree.createMerkleProof('123'));
    assert.equal(rsp, tree.root);
    rsp = await smt.getRoot(leafTwo, 256, tree.createMerkleProof('256'));
    assert.equal(rsp, tree.root);
  });

  it("should allow to update root", async() => {
    const smt = await SparseMerkleTree.new();

    // write first leaf
    let tree = new SmtLib(64);
    await smt.write(0, leafZero, tree.createMerkleProof('0'), leafOne);

    // write second leaf
    tree = new SmtLib(64, {'0': leafOne});
    await smt.write(1, leafZero, tree.createMerkleProof('1'), leafTwo);

    // read first leaf back
    tree = new SmtLib(64, {
      '0': leafOne,
      '1': leafTwo,
    });
    let rsp = await smt.read(0, leafOne, tree.createMerkleProof('0'));
    assert(rsp);
    // negative read test
    rsp = await smt.read(0, leafTwo, tree.createMerkleProof('0'));
    assert(!rsp);
  });

});