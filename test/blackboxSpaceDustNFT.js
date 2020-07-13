import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const SpaceDustNFT = artifacts.require('SpaceDustNFT');

contract('SpaceDustNFT', (accounts) => {

    // Coverage imporvement tests for SpaceDustNFT
    describe('SpaceDustNFTBlackboxTest', () => {
        it('should allow to call public functions', async () => {
            const token = await SpaceDustNFT.new();
            await token.name().should.be.fulfilled;
            await token.symbol().should.be.fulfilled;
            await token.totalSupply().should.be.fulfilled;
            await token.renounceMinter().should.be.fulfilled;
        });

        it('should report revert when calling safeTransferFrom', async () => {
            const token = await SpaceDustNFT.new();
            const from = '0xbd740e40b2fac80b0ca5f2eb98151e45cc706709';
            const to = '0x21948e448d19a17b08b33437e51545695919f8bf';
            const tokenId = '0x1a55262c7ae4400c4ccce1d3f983395cdeb1eb9040762f404b909f0581891a062fc17f7d0bbec1b672ff7226ba410ec66a7c9fd3944bae6fb6324943e7495f9988fc321d65de7b3b06c63b45fc4af0f920536eb3db2fc68a581b2cb50bb9e2a10285';
            await token.safeTransferFrom(from, to, tokenId).should.be.rejectedWith(EVMRevert);
        });

        it('should allow to call isApprovedForAll', async () => {
            const token = await SpaceDustNFT.new();
            const owner = '0xc0b7f406558ccbca5788dcdae1d0b91ce3778a72';
            const operator = '0x7d9e08d27538f005d142d7c63ea40a8af36134fd';
            await token.isApprovedForAll(owner, operator).should.be.fulfilled;
        });

        it('should allow to call setApprovalForAll', async () => {
            const token = await SpaceDustNFT.new();
            const to = '0xcf4d7a5e0d925e541c6eda2a58940d81f02cede3';
            const approved = true;
            await token.setApprovalForAll(to, approved).should.be.fulfilled;
        });

        it('should allow to call addMinter', async () => {
            const token = await SpaceDustNFT.new();
            const account = '0x9518eede5a804718e4e605426671821f89b8d49f';
            await token.addMinter(account).should.be.fulfilled;
        });

        it('should allow to call getApproved', async () => {
            const token = await SpaceDustNFT.new();
            const tokenId = '18693300302991583297628832853358557938503490244071024745100443533131345235134';
            await token.getApproved(tokenId).should.be.rejectedWith(EVMRevert);
        });

        it('should allow to call balanceOf', async () => {
            const token = await SpaceDustNFT.new();
            const owner = '0x5f051e137e169d2ad4e6d89c8c91b237f90d408e';
            await token.balanceOf(owner).should.be.fulfilled;
        });

        it('should allow to call tokenByIndex', async () => {
            const token = await SpaceDustNFT.new();
            const index = '23005602542603005135140975313615191860034641463088178128539355562857314971320';
            await token.tokenByIndex(index).should.be.rejectedWith(EVMRevert);
        });

        it('should allow to call tokenOfOwnerByIndex', async () => {
            const token = await SpaceDustNFT.new();
            const owner = '0x187c85dd7eaf440b5ea523748ef47c63291db307';
            const index = '113361486935586756014748434424423965376785985709153725994983976691352626630916';
            await token.tokenOfOwnerByIndex(owner, index).should.be.rejectedWith(EVMRevert);
        });

        it('should report revert when calling safeTransferFrom', async () => {
            const token = await SpaceDustNFT.new();
            const from = '0x91ae722038c1ab6a693426a04675941622af5abb';
            const to = '0x09e771648f6240d55889aad7e4a2a9e8b20c9b6f';
            const tokenId = '7073996078121281493346882390011224790701757085600908754448317511805321408105';
            await token.safeTransferFrom(from, to, tokenId).should.be.rejectedWith(EVMRevert);
        });

        it('should report revert when calling tokenURI', async () => {
            const token = await SpaceDustNFT.new();
            const arg = '33806962234580293024912309414755956440256911756645742708665733035976013233323';
            await token.tokenURI(arg).should.be.rejectedWith(EVMRevert);
        });

        it('should report revert when calling burn', async () => {
            const token = await SpaceDustNFT.new();
            const value = '107466526112613245223692818389822106825986423195576061143673087053032469054997';
            await token.burn(value).should.be.rejectedWith(EVMRevert);
        });

    });

});