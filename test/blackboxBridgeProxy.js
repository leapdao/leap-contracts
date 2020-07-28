import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const BridgeProxy = artifacts.require('BridgeProxy');

contract('Bridge', (accounts) => {

    // Coverage imporvement tests for BridgeProxy
    describe('BridgeProxyBlackboxTest', () => {
        it('should allow to call admin and implementation', async () => {
            const proxy = await BridgeProxy.deployed();
            await proxy.admin().should.be.fulfilled;
            await proxy.implementation().should.be.fulfilled;
        });

        it('should not allow to call changeAdmin without admin permission', async () => {
            const proxy = await BridgeProxy.deployed();
            const newAdmin = '0x30b126428898b36012396663bcc7da441d0f8156';
            await proxy.changeAdmin(newAdmin).should.be.rejectedWith(EVMRevert);
        });

        it('should not allow to call upgradeTo without admin permission', async () => {
            const proxy = await BridgeProxy.deployed();
            const newImplementation = '0xdae4a245eef04d522c89314e8b292a1e4dfee977';
            await proxy.upgradeTo(newImplementation).should.be.rejectedWith(EVMRevert);
        });

        it('should not allow to call upgradeToAndCall without admin permission', async () => {
            const proxy = await BridgeProxy.deployed();
            const newImplementation = '0xce8d663165edd5fb8e2cadfb0e9383b5fb0c9bed';
            const data = '0x4f1ef286000000000000000000000000ce8d663165edd5fb8e2cadfb0e9383b5fb0c9bed000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000d446675f8ff0f33342f8cb7d193afd6616b7e6f9ba5eeafc67a164e6651a3e159b69b195656c1a1e1de6cd99c9ccb5e170e86d88f60bd8d10fe0619738f4e2edc26571e9f38a1f188d5a5f6a7df80f77386b3789e4dc800727fab01bd75ca49da9b0cb717b7ea9525b2a3760a99bc9d55d7ad9aa71509a7f7c3f08274554ccf402218c07cd051c8af67305b4af0f4edb2440b6bd4680f7ce9e377c7853464d99be3adc516a528a78e3584891e9802c2e38da78203344e6be911be5ab247b247baf56478492923ba606d62e21e4e741b264e5b4b47b000000000000000000000000';
            await proxy.upgradeToAndCall(newImplementation, data).should.be.rejectedWith(EVMRevert);
        });
    });

});