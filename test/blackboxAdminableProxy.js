import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const AdminableProxy = artifacts.require('AdminableProxy');
const Bridge = artifacts.require('Bridge');

contract('AdminableProxy', (accounts) => {

    // Coverage imporvement tests for AdminableProxy
    describe('AdminableProxyBlackboxTest', () => {
        it('should not allow to call upgradeToAndCall without admin permission', async () => {
            const bridge = await Bridge.new();
            const parentBlockInterval = 0;
            const arg1 = '0xe16ee973a3d642a9e834a2ec4c0305afff7f6eb2';
            const arg2 = '0xd5b9aba833726bf3ba1809327df70051c7cfbbc47d790f2e88e52b3e2ac3fbbdbc9a49999ec85e05b330d14463bdc0721010ae8f7a0ea3788831adb1bc8c179a950e3c64e63b9899876203e0f200876811801169e4e5d69ce5480ed722f8213847b85efc3a354c5b989b33e4e1e8eed809';
            let data = bridge.contract.methods.initialize(parentBlockInterval).encodeABI();
            let proxy = await AdminableProxy.new(bridge.address, data, { from: accounts[2] });
            await proxy.upgradeToAndCall(arg1, arg2).should.be.rejectedWith(EVMRevert);
        });
    });

});