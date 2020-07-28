import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const OperatorProxy = artifacts.require('OperatorProxy');

contract('OperatorProxy', (accounts) => {

    // Coverage imporvement tests for OperatorProxy
    describe('OperatorProxyBlackboxTest', () => {
        it('should allow to call public functions', async () => {
            const operatorProxy = await OperatorProxy.deployed();
            await operatorProxy.admin().should.be.fulfilled;
            await operatorProxy.implementation().should.be.fulfilled;
        });

        it('should not allow to call upgradeToAndCall without admin permission', async () => {
            const operatorProxy = await OperatorProxy.deployed();
            const arg1 = '0x50e0f78823c5ceb0544a5126b58c9ff27b274274';
            const arg2 = '0xe171a17271ff4ca75aa87c34d4d7b6a98d425dd80c0912c100ac71a11e8d1cf70876b5fa192d46f7a765d00b2fd344e8cad799c8a0fc693b44122fe8c7d899cf4997f5a457620a2adaab352fdf6cc0dbf200002e3ca465b37572b5e3ded122efaf1685fac84bc0b6f6db12243c6d2ec94758ca8a3f957c107f665988da1d3dc2f6905bf96168c5fe75d4d5e1d1c21440dec132ffe7cb40b3726d03ae7c67';
            await operatorProxy.upgradeToAndCall(arg1, arg2).should.be.rejectedWith(EVMRevert);
        });

        it('should not allow to call applyProposal without admin permission', async () => {
            const operatorProxy = await OperatorProxy.deployed();
            const arg = '0xa1863ae79f1e50f9baa306156b58cf5356ab0d85952a0135d4e58227afa497a3964759c1bb35dc76544c8b50b3bcdd1b72fdb2eec4f0083a1e8fac6b9d240215';
            await operatorProxy.applyProposal(arg).should.be.rejectedWith(EVMRevert);
        });

        it('should not allow to call upgradeTo without admin permission', async () => {
            const operatorProxy = await OperatorProxy.deployed();
            const arg = '0x0d8e38ce3b8028b245b2fdaf7133c9717101c55e';
            await operatorProxy.upgradeTo(arg).should.be.rejectedWith(EVMRevert);
        });
    });

});