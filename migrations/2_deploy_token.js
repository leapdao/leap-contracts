/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

const log = require('./utils/log');

const NativeToken = artifacts.require('NativeToken');

module.exports = (deployer) => {

  const deployedToken = process.env.DEPLOYED_TOKEN;

  deployer.then(async () => {
  	if (!deployedToken) {
    	const nativeToken = await deployer.deploy(NativeToken, "LeapToken", "LEAP", 18);
    	log('Deployed LEAP Token at', nativeToken.address);
    }
  });
};