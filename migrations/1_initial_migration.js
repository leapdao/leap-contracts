const Migrations = artifacts.require('./Migrations.sol')

module.exports = (deployer) => {
	deployer.then(async () => {
	  let estimate = (await Migrations.new.estimateGas()) * 1.2;
	  await deployer.deploy(Migrations, {gas: estimate});
	});
}
