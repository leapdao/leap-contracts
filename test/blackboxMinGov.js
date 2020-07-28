import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const MinGov = artifacts.require('MinGov');

contract('MinGov', (accounts) => {

    // Coverage imporvement tests for MinGov
    describe('MinGovBlackboxTest', () => {
        it('should allow to call public functions', async () => {
            const gov = await MinGov.new(0);
            await gov.owner().should.be.fulfilled;
            await gov.isOwner().should.be.fulfilled;
            await gov.proposalTime().should.be.fulfilled;
            await gov.renounceOwnership().should.be.fulfilled;
        });

        it('should allow to call proposals', async () => {
            const gov = await MinGov.new(0);
            const arg = '50093900738867472629321312238646250315650639137866923260776170871079882487917';
            await gov.proposals(arg).should.be.fulfilled;
        });

        it('should allow to call transferOwnership', async () => {
            const gov = await MinGov.new(0);
            const arg = '0x57a4a0fa8b90b8c759873bce06068018fc7b2630';
            await gov.transferOwnership(arg).should.be.fulfilled;
        });
    });

});