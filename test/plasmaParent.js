const PlasmaParent = artifacts.require('./PlasmaParent.sol');
const Block = require('./helpers/Block/block');
const {blockNumberLength,
    txNumberLength,
    txTypeLength, 
    signatureVlength,
    signatureRlength,
    signatureSlength,
    merkleRootLength,
    previousHashLength,
    txOutputNumberLength,
    txAmountLength,
    txToAddressLength} = require('./helpers/dataStructureLengths');
const Web3 = require('web3');
const ethUtil = require('ethereumjs-util'); 
const BN = ethUtil.BN;

const createFundingTransaction = require('./helpers/createFundingTransaction');

contract('PlasmaParent', (accounts) => {

  it('should allow to deposit and submit block', async () => {
  	// deploy contract
    const plasmaParent = await PlasmaParent.new();
    // add operator
    await plasmaParent.setOperator('0xf3beac30c498d9e26865f34fcaa57dbb935b0d74', true);

    // deposit some ETH
    await plasmaParent.deposit({ from: accounts[1], value: new Web3.utils.BN(1000000) });
    let record = await plasmaParent.depositRecordsForUser(accounts[1]);
    assert(record.length > 0);
    // create deposit tx in block 0
    let txQueueArray = [];
    let depositIndexBN = new BN(0);
    const tx = createFundingTransaction(accounts[1], new Web3.utils.BN(1000000), depositIndexBN);
    txQueueArray.push(tx);

    // create first block
    let lastBlock = ethUtil.setLengthLeft(ethUtil.toBuffer(new BN(0)), blockNumberLength);
    let lastBlockHash = ethUtil.sha3('parsecLabs');
    const lastBlockNumber = Web3.utils.toBN(ethUtil.addHexPrefix(lastBlock.toString('hex')));
    const newBlockNumber = lastBlockNumber.add(new BN(1));
    const newBlockNumberBuffer = ethUtil.setLengthLeft(ethUtil.toBuffer(newBlockNumber), blockNumberLength);
    const blockParams = {
        blockNumber:  newBlockNumberBuffer,
        parentHash: lastBlockHash,
        transactions: txQueueArray
    }
    const block = new Block(blockParams); 
    let blockRaw = block.clearRaw(false);
    blockRaw = ethUtil.bufferToHex(Buffer.concat(blockRaw));
    const blockHash = ethUtil.sha3(blockRaw);

    // sign block by operator
    const privBuf = new Buffer('278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f', 'hex');
    const blockSig = ethUtil.ecsign(blockHash, privBuf);
    block.serializeSignature(blockSig.r.toString('hex') + blockSig.s.toString('hex') + blockSig.v.toString(16));

    // check previous block number
    let number = await plasmaParent.lastBlockNumber.call();

    // submit new block
    const hexData = ethUtil.addHexPrefix(Buffer.concat(block.header.raw).toString('hex'));
    let rv = await plasmaParent.submitBlockHeader(hexData);

    // assert submission
    let newNumber = await plasmaParent.lastBlockNumber.call();
    assert.equal(number.toNumber() + 1, newNumber.toNumber());
  });

  it('should allow challenge miner', async () => {

    // deploy contract
    const plasmaParent = await PlasmaParent.new();
    // add operator
    await plasmaParent.setOperator('0xf3beac30c498d9e26865f34fcaa57dbb935b0d74', true);

    // deposit some ETH
    await plasmaParent.deposit({ from: accounts[1], value: new Web3.utils.BN(1000000) });
    let record = await plasmaParent.depositRecordsForUser(accounts[1]);
    assert(record.length > 0);
    // create deposit tx in block 0
    let txQueueArray = [];
    let depositIndexBN = new BN(0);
    const tx = createFundingTransaction(accounts[1], new Web3.utils.BN(1000000), depositIndexBN);
    txQueueArray.push(tx);

    // create first block
    let lastBlock = ethUtil.setLengthLeft(ethUtil.toBuffer(new BN(0)), blockNumberLength);
    let lastBlockHash = ethUtil.sha3('parsecLabs');
    const lastBlockNumber = Web3.utils.toBN(ethUtil.addHexPrefix(lastBlock.toString('hex')));
    const newBlockNumber = lastBlockNumber.add(new BN(1));
    const newBlockNumberBuffer = ethUtil.setLengthLeft(ethUtil.toBuffer(newBlockNumber), blockNumberLength);
    const blockParams = {
        blockNumber:  newBlockNumberBuffer,
        parentHash: lastBlockHash,
        transactions: txQueueArray
    }
    const block = new Block(blockParams); 
    let blockRaw = block.clearRaw(false);
    blockRaw = ethUtil.bufferToHex(Buffer.concat(blockRaw));
    const blockHash = ethUtil.sha3(blockRaw);

    // sign block by operator
    const privBuf = new Buffer('278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f', 'hex');
    const blockSig = ethUtil.ecsign(blockHash, privBuf);
    block.serializeSignature(blockSig.r.toString('hex') + blockSig.s.toString('hex') + blockSig.v.toString(16));

    // check previous block number
    let number = await plasmaParent.lastBlockNumber.call();

    // submit new block
    const hexData = ethUtil.addHexPrefix(Buffer.concat(block.header.raw).toString('hex'));
    let rv = await plasmaParent.submitBlockHeader(hexData);



    // create deposit tx in block 0
    // let txQueueArray = [];
    // let depositIndexBN = new BN(0);
    // const tx = createFundingTransaction(accounts[1], new Web3.utils.BN(1000), depositIndexBN);
    // let txRaw = Buffer.concat(tx.clearRaw(false, false));
    // const privBuf = new Buffer('278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f', 'hex');
    // const hash = ethUtil.sha3(txRaw);
    // const sig = ethUtil.ecsign(hash, privBuf);
    // tx.serializeSignature(sig.r.toString('hex') + sig.s.toString('hex') + sig.v.toString(16));
    // txQueueArray.push(tx);
  });

});
