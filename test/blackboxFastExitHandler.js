import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const FastExitHandler = artifacts.require('FastExitHandler');

contract('FastExitHandler', (accounts) => {

    // Coverage imporvement tests for FastExitHandler
    describe('FastExitHandlerBlackboxTest', () => {
        it('should allow to call public functions', async () => {
            const handler = await FastExitHandler.deployed();
            await handler.admin().should.be.fulfilled;
            await handler.nstTokenCount().should.be.fulfilled; 
            await handler.exitStake().should.be.fulfilled;
        });

        it('should allow to call initialize', async () => {
            const handler = await FastExitHandler.deployed();
            const arg = '0x4548e7c72fc75e073ed802f31443924200dbf807';
            await handler.initialize(arg).should.be.fulfilled;
        });

        it('should allow to call deposits', async () => {
            const handler = await FastExitHandler.deployed();
            const arg = '3662845420';
            await handler.deposits(arg).should.be.fulfilled;
        });

        it('should allow to call tokens', async () => {
            const handler = await FastExitHandler.deployed();
            const arg = '5032';
            await handler.tokens(arg).should.be.fulfilled;
        });

        it('should report revert on Wrong challenger when calling challengeYoungestInput', async () => {
            const handler = await FastExitHandler.deployed();
            const youngerInputProof = ['0x230fc118b0d54a456876d7b99ccc221b20ed5e48259be4cbc3c57a249b951be4'];
            const exitingTxProof = ['0x8558a7039cf923fc1046d39a2b2c6c5925bdb0933555d2001d48de7481af452c'];
            const outputIndex = '18';
            const inputIndex = '15';
            const challenger = '0x27f68d2c1fe5f580ed6d3307c990cd9c66407b74';
            await handler.challengeYoungestInput(youngerInputProof, exitingTxProof, outputIndex, inputIndex, challenger).should.be.rejectedWith(EVMRevert);
        });

        it('should report revert on Wrong challenger when calling challengeExit', async () => {
            const handler = await FastExitHandler.deployed();
            const proof = ['0x9f2386fdaf56f0f36eb91397958f8731936c76f2d7f1416e88aea740cf744b41'];
            const prevProof = ['0x1852f4272517315fc3b07b6a0c44bb98cc3bc2aa4777e48b6c2fae307e323177'];
            const outputIndex = '190';
            const inputIndex = '172';
            const challenger = '0xe3a0cd7fba456e66261f084b225c7bba157a5289';
            await handler.challengeExit(proof, prevProof, outputIndex, inputIndex, challenger).should.be.rejectedWith(EVMRevert);
        });

        it('should report revert on Wrong challenger when calling startExit', async () => {
            const handler = await FastExitHandler.deployed();
            const youngestInputProof = ['0x454e83db9d7f61ab5bd7a998140bc4f17aac71aff6f229105302d800c9e9c9f0'];
            const proof = ['0xd4eb714ee190b1250b497a6a988c6a2feb6a084dfa72df8bdc7581356d5875c1'];
            const outputIndex = '238';
            const inputIndex = '86';
            await handler.startExit(youngestInputProof, proof, outputIndex, inputIndex).should.be.rejectedWith(EVMRevert);
        });

        it('should not allow to call depositBySender', async () => {
            const handler = await FastExitHandler.deployed();
            const amountOrTokenId = '4480365206216364445374006444371875508405961465066149810314453285183562813654';
            const color = '9924';
            await handler.depositBySender(amountOrTokenId, color).should.be.rejectedWith(EVMRevert);
        });

        it('should not allow to call startDepositExit without owner permission', async () => {
            const handler = await FastExitHandler.deployed();
            const depositId = '99387598772445811392054892916031075469212601782978189782221669492240287432374';
            await handler.startDepositExit(depositId).should.be.rejectedWith(EVMRevert);
        });
    });

});