import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const SwapRegistry = artifacts.require('SwapRegistry');

contract('SwapRegistry', (accounts) => {

    // Coverage imporvement tests for SwapRegistry
    describe('SwapRegistryBlackboxTest', () => {
        it('should allow to call public functions', async () => {
            const swapRegistry = await SwapRegistry.new();
            const exchange = '0xe676ae342549cef17293f93d8d218f3507f46c57';
            await swapRegistry.admin().should.be.fulfilled;
            await swapRegistry.getToken(exchange).should.be.fulfilled;
        });

        it('should report revert on unexpected slotId when calling claim', async () => {
            const swapRegistry = await SwapRegistry.new();
            const claimArg1 = '32902856902806981185853542240199999638367489034202973312579107582913167242155';
            const claimArg2 = ['0xd6618f1dcb68da1e1f381e5a4dc6328c921c4c6ce910a417b9f4204f90872434'];
            const claimArg3 = ['0xc3317b8a71e544ab34faafd6285ce4cdcf3b03e07fac669102015e776d873116'];
            const claimArg4 = ['0xc2973689a518beca84c1d68f385cd28d7ea29983cef161c64d7f2582fb2fb74f'];
            const claimArg5 = ['0x8b71c39e33665e1f5ae6b07e0a896c52b5e95bd0a96b507145c1aa068fac42b0'];
            await swapRegistry.claim(claimArg1, claimArg2, claimArg3, claimArg4, claimArg5).should.be.rejectedWith(EVMRevert);
        });

        it('should not allow to call setTaxRate without admin permission', async () => {
            const swapRegistry = await SwapRegistry.deployed();
            const taxRate = '1142958859034813275424711289067945144565646423745656592294121230499057242604';
            await swapRegistry.setTaxRate(taxRate).should.be.rejectedWith(EVMRevert);
        });

        it('should not allow to call setExchangeCodeAddr without admin permission', async () => {
            const swapRegistry = await SwapRegistry.deployed();
            const exchangeCodeAddr = '0xe676ae342549cef17293f93d8d218f3507f46c57';
            await swapRegistry.setExchangeCodeAddr(exchangeCodeAddr).should.be.rejectedWith(EVMRevert);
        });

        it('should not allow to call setInflationRate without admin permission', async () => {
            const swapRegistry = await SwapRegistry.deployed();
            const inflationRate = '86436028051279906664119205081926382220974145524864350025244515808776978256996';
            await swapRegistry.setInflationRate(inflationRate).should.be.rejectedWith(EVMRevert);
        });
    });

});