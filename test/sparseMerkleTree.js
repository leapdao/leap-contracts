const SparseMerkleTree = artifacts.require("SparseMerkleTree");
const SmtLib = require('./helpers/SmtLib.js');

contract("SparseMerkleTree", () => {

  const leafOne = '0xa59a60d98b69a32028020fbf69c27dc2188b5756975e93b330a3f1513f383076';
  const leafTwo = '0x95d22ccdd977e992e4a530ce4f1304e1a7a1840823ea1b4f7bf3841049d197e0';
  const leafThree = '0x3d32085b3de13667b43fd7cecf200b347041918e259cbcc86796422a47fec794';
  const leafZero = '0x290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563';

  it("should allow to verify proofs with single intersection at 1 - test1", async() => {
    const smt = await SparseMerkleTree.new();
    const tree = new SmtLib(160, {
        '0x8A36e7eE34972ffC688f238Ff7154C729b7D026F': leafOne,
        '0x09ACF5301cb4EE676ed5ad771259bDc0360C1415': leafTwo,
    });
    let rsp = await smt.getRoot(leafOne, '0x8A36e7eE34972ffC688f238Ff7154C729b7D026F', tree.createMerkleProof('0x8A36e7eE34972ffC688f238Ff7154C729b7D026F'));
    assert.equal(rsp, tree.root);
    rsp = await smt.getRoot(leafTwo, '0x09ACF5301cb4EE676ed5ad771259bDc0360C1415', tree.createMerkleProof('0x09ACF5301cb4EE676ed5ad771259bDc0360C1415'));
    assert.equal(rsp, tree.root);
    rsp = await smt.getRoot(leafZero, 2, tree.createMerkleProof('2'));
    assert.equal(rsp, tree.root);
  });

  it("should allow to verify proofs with single intersection at 1 - test2", async() => {
    const smt = await SparseMerkleTree.new();
    const tree = new SmtLib(160, {
        '0x000000000000000000000000000000008a36e7ee': leafOne,
        '0x0000000000000000000000000000000009acf530': leafTwo,
    });
    let rsp = await smt.getRoot(leafOne, 0x000000000000000000000000000000008a36e7ee, tree.createMerkleProof('0x000000000000000000000000000000008a36e7ee'));
    assert.equal(rsp, tree.root);
    rsp = await smt.getRoot(leafTwo, 0x0000000000000000000000000000000009acf530, tree.createMerkleProof('0x0000000000000000000000000000000009acf530'));
    assert.equal(rsp, tree.root);
    rsp = await smt.getRoot(leafZero, 2, tree.createMerkleProof('2'));
    assert.equal(rsp, tree.root);
  });


  it("should allow to verify proofs with multiple intersections - test1", async() => {
    const smt = await SparseMerkleTree.new();
    const tree = new SmtLib(160, {
        '0x8A36e7eE34972ffC688f238Ff7154C729b7D026F': leafOne,
        '0x09ACF5301cb4EE676ed5ad771259bDc0360C1415': leafTwo,
        '0x14BC7a8f8919472B5019A54e7fE7090785d41f85': leafThree,
    });
    let rsp = await smt.getRoot(leafOne, '0x8A36e7eE34972ffC688f238Ff7154C729b7D026F', tree.createMerkleProof('0x8A36e7eE34972ffC688f238Ff7154C729b7D026F'));
    assert.equal(rsp, tree.root);
    rsp = await smt.getRoot(leafTwo, '0x09ACF5301cb4EE676ed5ad771259bDc0360C1415', tree.createMerkleProof('0x09ACF5301cb4EE676ed5ad771259bDc0360C1415'));
    assert.equal(rsp, tree.root);
    rsp = await smt.getRoot(leafThree, '0x14BC7a8f8919472B5019A54e7fE7090785d41f85', tree.createMerkleProof('0x14BC7a8f8919472B5019A54e7fE7090785d41f85'));
    assert.equal(rsp, tree.root);
  });

  it("should allow to verify proofs with multiple intersections - test2", async() => {
    const smt = await SparseMerkleTree.new();
    const tree = new SmtLib(160, {
        '0x000000000000000000000000000000008a36e7ee': leafOne,
        '0x0000000000000000000000000000000009acf530': leafTwo,
        '0x0000000000000000000000000000000014bc7a8f': leafThree,
    });
    let rsp = await smt.getRoot(leafOne, 0x000000000000000000000000000000008a36e7ee, tree.createMerkleProof('0x000000000000000000000000000000008a36e7ee'));
    assert.equal(rsp, tree.root);
    rsp = await smt.getRoot(leafTwo, 0x0000000000000000000000000000000009acf530, tree.createMerkleProof('0x0000000000000000000000000000000009acf530'));
    assert.equal(rsp, tree.root);
    rsp = await smt.getRoot(leafThree, 0x0000000000000000000000000000000014bc7a8f, tree.createMerkleProof('0x0000000000000000000000000000000014bc7a8f'));
    assert.equal(rsp, tree.root);
  });

  it("should allow to update root - test1", async() => {
    const smt = await SparseMerkleTree.new();

    // write first leaf
    let tree = new SmtLib(160);
    await smt.write('0x8A36e7eE34972ffC688f238Ff7154C729b7D026F', leafZero, tree.createMerkleProof('0x8A36e7eE34972ffC688f238Ff7154C729b7D026F'), leafOne);

    // write second leaf
    tree = new SmtLib(160, {'0x8A36e7eE34972ffC688f238Ff7154C729b7D026F': leafOne});
    await smt.write('0x09ACF5301cb4EE676ed5ad771259bDc0360C1415', leafZero, tree.createMerkleProof('0x09ACF5301cb4EE676ed5ad771259bDc0360C1415'), leafTwo);

    // read first leaf back
    tree = new SmtLib(160, {
      '0x8A36e7eE34972ffC688f238Ff7154C729b7D026F': leafOne,
      '0x09ACF5301cb4EE676ed5ad771259bDc0360C1415': leafTwo,
    });
    let rsp = await smt.read('0x8A36e7eE34972ffC688f238Ff7154C729b7D026F', leafOne, tree.createMerkleProof('0x8A36e7eE34972ffC688f238Ff7154C729b7D026F'));
    assert(rsp);
    // negative read test
    rsp = await smt.read('0x8A36e7eE34972ffC688f238Ff7154C729b7D026F', leafTwo, tree.createMerkleProof('0x09ACF5301cb4EE676ed5ad771259bDc0360C1415'));
    assert(!rsp);

    // delete test
    await smt.del('0x8A36e7eE34972ffC688f238Ff7154C729b7D026F', leafOne, tree.createMerkleProof('0x8A36e7eE34972ffC688f238Ff7154C729b7D026F'));
    rsp = await smt.read('0x8A36e7eE34972ffC688f238Ff7154C729b7D026F', leafZero, tree.createMerkleProof('0x8A36e7eE34972ffC688f238Ff7154C729b7D026F'));
    assert(rsp);
  });

  it("should allow to update root - test2", async() => {
    const smt = await SparseMerkleTree.new();

    // write first leaf
    let tree = new SmtLib(160);
    await smt.write(0x000000000000000000000000000000008a36e7ee, leafZero, tree.createMerkleProof('0x000000000000000000000000000000008a36e7ee'), leafOne);

    // write second leaf
    tree = new SmtLib(160, {'0x000000000000000000000000000000008a36e7ee': leafOne});
    await smt.write(0x0000000000000000000000000000000009acf530, leafZero, tree.createMerkleProof('0x0000000000000000000000000000000009acf530'), leafTwo);

    // read first leaf back
    tree = new SmtLib(160, {
      '0x000000000000000000000000000000008a36e7ee': leafOne,
      '0x0000000000000000000000000000000009acf530': leafTwo,
    });
    let rsp = await smt.read(0x000000000000000000000000000000008a36e7ee, leafOne, tree.createMerkleProof('0x000000000000000000000000000000008a36e7ee'));
    assert(rsp);
    // negative read test
    rsp = await smt.read(0x000000000000000000000000000000008a36e7ee, leafTwo, tree.createMerkleProof('0x000000000000000000000000000000008a36e7ee'));
    assert(!rsp);

    // delete test
    await smt.del(0x000000000000000000000000000000008a36e7ee, leafOne, tree.createMerkleProof('0x000000000000000000000000000000008a36e7ee'));
    rsp = await smt.read(0x000000000000000000000000000000008a36e7ee, leafZero, tree.createMerkleProof('0x000000000000000000000000000000008a36e7ee'));
    assert(rsp);
  });

  it("The issue with the delete function", async() => {
    const smt = await SparseMerkleTree.new();

    // write first leaf
    let tree = new SmtLib(160);
    await smt.write('0x8A36e7eE34972ffC688f238Ff7154C729b7D026F', leafZero, tree.createMerkleProof('0x8A36e7eE34972ffC688f238Ff7154C729b7D026F'), leafOne);

    // write second leaf
    tree = new SmtLib(160, {'0x8A36e7eE34972ffC688f238Ff7154C729b7D026F': leafOne});
    await smt.write('0x09ACF5301cb4EE676ed5ad771259bDc0360C1415', leafZero, tree.createMerkleProof('0x09ACF5301cb4EE676ed5ad771259bDc0360C1415'), leafTwo);

    // read first leaf back
    tree = new SmtLib(160, {
      '0x8A36e7eE34972ffC688f238Ff7154C729b7D026F': leafOne,
      '0x09ACF5301cb4EE676ed5ad771259bDc0360C1415': leafTwo,
    });
    let rsp = await smt.read('0x8A36e7eE34972ffC688f238Ff7154C729b7D026F', leafOne, tree.createMerkleProof('0x8A36e7eE34972ffC688f238Ff7154C729b7D026F'));
    assert(rsp);
    // read second leaf
    rsp = await smt.read('0x09ACF5301cb4EE676ed5ad771259bDc0360C1415', leafTwo, tree.createMerkleProof('0x09ACF5301cb4EE676ed5ad771259bDc0360C1415'));
    assert(rsp);

    // delete test
    await smt.del('0x8A36e7eE34972ffC688f238Ff7154C729b7D026F', leafOne, tree.createMerkleProof('0x8A36e7eE34972ffC688f238Ff7154C729b7D026F'));
    // After calling the delete function with one key, the root takes zerohashes value. So, others writes deletes too and you can't use read function.
    rsp = await smt.read('0x09ACF5301cb4EE676ed5ad771259bDc0360C1415', leafTwo, tree.createMerkleProof('0x09ACF5301cb4EE676ed5ad771259bDc0360C1415'));
    assert(!rsp);
  });

});
