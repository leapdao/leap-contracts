import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const SimpleToken = artifacts.require('SimpleToken');

contract('SimpleToken', (accounts) => {

    // Coverage imporvement tests for SimpleToken
    describe('SimpleTokenBlackboxTest', () => {
        it('should allow to call public functions', async () => {
            const simpleToken = await SimpleToken.new();
            await simpleToken.name().should.be.fulfilled;
            await simpleToken.symbol().should.be.fulfilled;
            await simpleToken.decimals().should.be.fulfilled;
            await simpleToken.renounceMinter().should.be.fulfilled;
        });

        it('should allow to call increase/decreaseAllowance', async () => {
            const simpleToken = await SimpleToken.new();
            const arg1 = '0xf05d59fd8e54a19f9dd3c92860b31564459d6d84';
            const arg2 = '93769139581514889965763384595196294280435098260904252267832265397937088947770';
            await simpleToken.increaseAllowance(arg1, arg2).should.be.fulfilled;
            await simpleToken.decreaseAllowance(arg1, arg2).should.be.fulfilled;
        });

        it('should report revert when calling burn', async () => {
            const simpleToken = await SimpleToken.new();
            const value = '69281635539460649522612807084672103192749169981722615654601991271393182093225';
            await simpleToken.burn(value).should.be.rejectedWith(EVMRevert);
        });

        it('should allow to call mint', async () => {
            const simpleToken = await SimpleToken.new();
            const arg1 = '0xc1c91c04cff092b2cb8aa9a2a854355295265503';
            const arg2 = '9852429980279857685929467215828519008004598309884105771671699652987210367049';
            await simpleToken.mint(arg1, arg2).should.be.fulfilled;
        });

        it('should allow to call isMinter', async () => {
            const simpleToken = await SimpleToken.new();
            const account = '0x620b705a5d83d177e0e0e2ceeb6a8fe292ac9a39';
            await simpleToken.isMinter(account).should.be.fulfilled;
        });

        it('should allow to call allowance', async () => {
            const simpleToken = await SimpleToken.new();
            const arg1 = '0x67f17f215823bf7e69778da437047b42bfe7847b';
            const arg2 = '0xd260323e1f66ba69885af24ecbb2333baf1eca9c';
            await simpleToken.allowance(arg1, arg2).should.be.fulfilled;
        });

        it('should report revert when calling burnFrom', async () => {
            const simpleToken = await SimpleToken.new();
            const arg1 = '0xfbce5cbaa067e19e168002e03b3f84dc2c607e1f';
            const arg2 = '35006553953761707676017420775096465122731222798524085622999460156191782861425';
            await simpleToken.burnFrom(arg1, arg2).should.be.rejectedWith(EVMRevert);
        });

        it('should allow to call addMinter', async () => {
            const simpleToken = await SimpleToken.new();
            const account = '0xc1433bcd4c886631b42d5921166172407ad24d16';
            await simpleToken.addMinter(account).should.be.fulfilled;
        });
    });

});