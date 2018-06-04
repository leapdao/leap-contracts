import { Tx, Block } from 'parsec-lib';
const ParsecBridge = artifacts.require('./ParsecBridge.sol');
const SimpleToken = artifacts.require('SimpleToken');

contract('Parsec', (accounts) => {
    const blockReward = 5000000;
    const empty = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const c = accounts[0];  // operator charlie, stake: 4 * ts / epochLength
    const cPriv = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';

    let totalSupply;

    it.skip("calculate gas costs", async () => {
        const token = await SimpleToken.new();
        const parsec = await ParsecBridge.new(token.address, 0, 64, blockReward, 0);
        totalSupply = await token.totalSupply();
        await token.approve(parsec.address, 100000000000, {from: c});
        await parsec.join(totalSupply.div(64).mul(4), {from: c});


        const blocks = [];
        blocks[0] = await parsec.tipHash();
        let block = new Block(blocks[0], 1);
        let sig
        for(let i = 1; i < 20; i++) {
            console.log(i)
            block = new Block(blocks[i - 1], i).addTx(new Tx().coinbase(blockReward, c));
            sig = block.sign(cPriv);
            blocks[i] = block.hash()
            await parsec.submitBlock(blocks[i - 1], block.merkleRoot(), ...sig, {from: c});
            let gasPrice = await parsec.getAverageGasPrice.call()
            console.log("gasPrice " + gasPrice.toNumber())
        }
        await parsec.testAverageToStorage()
        assert(false)

    })

    it('should allow to have epoch length of 128', async () => {
        const token128 = await SimpleToken.new();
        const parsec128 = await ParsecBridge.new(token128.address, 0, 128, 5000000, 0);
        totalSupply = await token128.totalSupply();
        await token128.approve(parsec128.address, totalSupply, {from: c});
        await parsec128.join(totalSupply.div(128).mul(4), {from: c});

        const b128 = [];
        b128[0] = await parsec128.tipHash();
        let block = new Block(b128[0], 1);
        let sig

        for (let i = 1; i < 129; i++) {
            console.log(i)
            block = new Block(b128[i - 1], i).addTx(new Tx().coinbase(blockReward, c));
            sig = block.sign(cPriv);
            b128[i] = block.hash()
            await parsec128.submitBlock(b128[i - 1], block.merkleRoot(), ...sig);
        }
    })
})