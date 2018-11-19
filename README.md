# LeapDAO Bridge implementation
[![Build Status](https://travis-ci.org/leapdao/leap-contracts.svg?branch=master)](https://travis-ci.org/leapdao/leap-contracts)
# Development

```
yarn
yarn test 
```
# Contracts

In this repository are the solidity smart contracts implementing LeapDAO's plasma leap. 

There are 3 smart contracts that get deployed:

* Bridge

  The bridge is responsible for storing the period chain. It is the source of truth for the plasma chain.

* Operator

  The operator is the contract that is responsible for submitting new periods to the bridge.

* ExitHandler

  This contract is responsible for user funds. Explained in more detail below.

![Layout](./img/layout.png)

The ExitHandler is actually the final contract in an inheritance chain that goes as follows:

* Vault 

  The vault defines what types of assets are allowed on the plasma chain and is responsible for registration of these funds.

* DepositHandler

  The deposit handler is in general responsible for how funds get onto the plasma chain.

* ExitHandler

  The exit handler is in general responsible for how funds leave the plasma chain.

![Inheritance chain](./img/inheritnace.png)

## LICENSE

Project source files are made available under the terms of the Mozilla Public License (MPLv2). See individual files for details.
