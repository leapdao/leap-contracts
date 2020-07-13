import EVMRevert from './helpers/EVMRevert';

require('./helpers/setup');

const Migrations = artifacts.require('Migrations');

contract('Migrations', (accounts) => {

    // Coverage imporvement tests for Migrations
    describe('MigrationsBlackboxTest', () => {
        it('should allow to call public functions', async () => {
            const migration = await Migrations.new();
            await migration.owner().should.be.fulfilled;
            await migration.lastCompletedMigration().should.be.fulfilled;
        });

        it('should allow to call setCompleted', async () => {
            const migration = await Migrations.new();
            const completed = '70963566859899165839558527649111661649699347273832314083995706144526855886607';
            await migration.setCompleted(completed).should.be.fulfilled;
        });

        it('should not allow to call upgrade without owner permission', async () => {
            const migration = await Migrations.new();
            const arg = '0x49e539d2df581157b1b8b1264d0679fc3911bfce';
            await migration.upgrade(arg).should.be.rejectedWith(EVMRevert);
        });
    });

});