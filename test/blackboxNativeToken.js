import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const NativeToken = artifacts.require('NativeToken');

contract('NativeToken', (accounts) => {

    // Coverage imporvement tests for NativeToken
    describe('NativeTokenBlackboxTest', () => {
        it('should allow to call public functions', async () => {
            const nativeToken = await NativeToken.new("Token", "TOK", 18);
            await nativeToken.name().should.be.fulfilled;
            await nativeToken.symbol().should.be.fulfilled;
            await nativeToken.decimals().should.be.fulfilled;
            await nativeToken.renounceMinter().should.be.fulfilled;
        });

        it('should allow to call increase/decreaseAllowance', async () => {
            const nativeToken = await NativeToken.new("Token", "TOK", 18);
            const arg1 = '0xd3029380fbd75b98c2628e1e7af70a816e9b66ad';
            const arg2 = '93711521097009361375284895256869528583728073863956338933042532117529833830903';
            await nativeToken.increaseAllowance(arg1, arg2).should.be.fulfilled;
            await nativeToken.decreaseAllowance(arg1, arg2).should.be.fulfilled;
        });

        it('should allow to call allowance', async () => {
            const nativeToken = await NativeToken.new("Token", "TOK", 18);
            const arg1 = '0xa7a9bb0480178d1324e5d5b8411f0d53e4b18baa';
            const arg2 = '0x70903adef31496c7927543197bee8370346adbab';
            await nativeToken.allowance(arg1, arg2).should.be.fulfilled;
        });

        it('should report revert when calling burnFrom', async () => {
            const nativeToken = await NativeToken.new("Token", "TOK", 18);
            const arg1 = '0xdc3749d2d628d78afb30f345d07b5703476ddb76';
            const arg2 = '64297420200039148773101778052343977788020645197704650418907426242172643152507';
            await nativeToken.burnFrom(arg1, arg2).should.be.rejectedWith(EVMRevert);
        });

    });

});