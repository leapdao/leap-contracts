import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const ExitHandlerProxy = artifacts.require('ExitHandlerProxy');

contract('Bridge', (accounts) => {

    // Coverage imporvement tests for ExitHandlerProxy
    describe('ExitHandlerProxyBlackboxTest', () => {
        it('should allow to call admin and implementation', async () => {
            const proxy = await ExitHandlerProxy.deployed();
            await proxy.admin().should.be.fulfilled;
            await proxy.implementation().should.be.fulfilled;
        });

        it('should not allow to call changeAdmin without admin permission', async () => {
            const proxy = await ExitHandlerProxy.deployed();
            const newAdmin = '0x597529ad7b07b9ed91fe5221a3f019bb69795f96';
            await proxy.changeAdmin(newAdmin).should.be.rejectedWith(EVMRevert);
        });

        it('should not allow to call upgradeTo without admin permission', async () => {
            const proxy = await ExitHandlerProxy.deployed();
            const newImplementation = '0xe2becf1e00a56d6644cab041804997ddfb6cb62b';
            await proxy.upgradeTo(newImplementation).should.be.rejectedWith(EVMRevert);
        });

        it('should not allow to call upgradeToAndCall without admin permission', async () => {
            const proxy = await ExitHandlerProxy.deployed();
            const newImplementation = '0xc8798d1d03b6ddef7e32594c5900b8d22c8bd037';
            const data = '0x4f1ef286000000000000000000000000c8798d1d03b6ddef7e32594c5900b8d22c8bd0370000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000009ceb4987796cfd9ec5293e334553d7ab1fc24effd9182b9e43ad9b6c1ecee755d57c3a6f1222432d0efa684dd6d2e8746a4d77dc7d1e592caf0dc82dc048ca6ba4b276fb215521c1114d8a5a9d8609fc6f8dcce49288be9741124005a9876185cca54396dfc4fa855c33cb2221eee9a7b070ffa9b8755b4637c3a312638d308ee088d2ac2cb86f912dde1cf2c97b338f7f62da12b0fb8f5cf3404c161e00000000';
            await proxy.upgradeToAndCall(newImplementation, data).should.be.rejectedWith(EVMRevert);
        });
    });

});