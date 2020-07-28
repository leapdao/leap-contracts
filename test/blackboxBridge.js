import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const Bridge = artifacts.require('Bridge');

contract('Bridge', (accounts) => {

    // Coverage imporvement tests for Bridge
    describe('BridgeBlackboxTest', () => {
        it('should not allow to call setOperator without admin permission', async () => {
            const bridge = await Bridge.new();
            const operator = '0xd1a81aa8c4288fbf84fe83947a06f38763f645ee';
            await bridge.setOperator(operator).should.be.rejectedWith(EVMRevert);
        });

        it('should not allow to call ubmitPeriod without operator premission', async () => {
            const bridge = await Bridge.new();
            const arg1 = '0xcce0c5c0a51d75a5a6d7b4b049f75f358398ab4210fbd0571d190fd1e83171c2';
            const arg2 = '0x00df40f4bb7be9a69fb997202d5ccc482bd43701783c461beb05f534579c3b6a';
            await bridge.submitPeriod(arg1, arg2).should.be.rejectedWith(EVMRevert);
        });

        it('should allow to call initialize with blackbox generated value', async () => {
            const bridge = await Bridge.new();
            const parentBlockInterval = '0xe2a156e1314cd3dea54a14ef9b7c8eed0492651ae35e6fe9877cef277c58c622';
            await bridge.initialize(parentBlockInterval).should.be.fulfilled;
        });

        it('should not allow to call setParentBlockInterval without admin permission', async () => {
            const bridge = await Bridge.new();
            const parentBlockInterval = '0xac5167fee3554b1785217edf9147585ea433c04c91dc554012638ec7c6008a8e';
            await bridge.setParentBlockInterval(parentBlockInterval).should.be.rejectedWith(EVMRevert);
        });

        it('should not allow to call deletePeriod without operator premission', async () => {
            const bridge = await Bridge.new();
            const toDelete = '0x8d4f8497ace4736892521ed024932501de74bce4eace75d9b8fba3fd72284915';
            await bridge.deletePeriod(toDelete).should.be.rejectedWith(EVMRevert);
        });

        it('should allow to visit public variables', async () => {
            const bridge = await Bridge.new();
            await bridge.lastParentBlock().should.be.fulfilled;
            await bridge.genesisBlockNumber().should.be.fulfilled;
        });
    });

});