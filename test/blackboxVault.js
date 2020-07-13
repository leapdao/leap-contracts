import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const Vault = artifacts.require('Vault');

contract('Vault', (accounts) => {

    // Coverage imporvement tests for Vault
    describe('VaultBlackboxTest', () => {
        it('should allow to call public functions', async () => {
            const vault = await Vault.new();
            await vault.admin().should.be.fulfilled;
            await vault.erc20TokenCount().should.be.fulfilled;
            await vault.nstTokenCount().should.be.fulfilled;
            await vault.nftTokenCount().should.be.fulfilled;
            await vault.implementation().should.be.fulfilled;
        });

        it('should allow to call tokenColors', async () => {
            const vault = await Vault.new();
            const arg = '0x84df328cb570ba93c4fd407e743eaa0c58fc2ae2';
            await vault.tokenColors(arg).should.be.fulfilled;
        });

        it('should allow to call initialize', async () => {
            const vault = await Vault.new();
            const arg = '0xb245af39437285386874ad911fb6180e0a90d35b';
            await vault.initialize(arg).should.be.fulfilled;
        });
    });

});