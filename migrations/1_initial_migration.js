/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

const Migrations = artifacts.require('./Migrations.sol')

module.exports = (deployer) => {
	deployer.then(async () => {
	  let estimate = (await Migrations.new.estimateGas()) * 2;
	  await deployer.deploy(Migrations, {gas: estimate});
	});
}
