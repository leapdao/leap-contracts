/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the Mozilla Public License, version 2,
 * found in the LICENSE file in the root directory of this source tree.
 */

/* eslint-disable no-console */

const LeapToken = artifacts.require('LeapToken');

module.exports = (deployer, network, accounts) => {
  deployer.then(async () => {
    const leapToken = await deployer.deploy(LeapToken);
    console.log('Deployed LEAP Token at', leapToken.address);
  });
};