# LeapDAO Bridge implementation
[![Build Status](https://travis-ci.org/leapdao/leap-contracts.svg?branch=master)](https://travis-ci.org/leapdao/leap-contracts)
# Development

## Getting started

```
yarn
yarn test 
```

## Deploying contracts

> All the commands support any truffle options like `--network` or `--reset`.


Contract may be customized via ENV variables:

| ENV variable | Description | Default value |
| ------- | ----------- | ------------- |
| PROPOSAL_TIME | Governance proposal cool-off time (in seconds) | `1209600` (14 days) |
|EXIT_STAKE| Exit stake (in LEAP cents) |0|
|EXIT_DURATION| Exit duration (in seconds) |`1209600` (14 days)|

E.g. `PROPOSAL_TIME=600 EXIT_DURATION=180 yarn deploy` deploys plasma contract with 3 minutes exit duration governed by MinGov with 10 minutes proposal time.

### Deploy everything

```
yarn deploy
```

This will deploy deploy token, plasma and governance contracts.

### Deploy only plasma and governance contracts (reusing token)

```
yarn deploy:plasma
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

  The vault defines what types of assets are allowed on the plasma chain and is responsible for registration of these assets.

* DepositHandler

  The deposit handler is in general responsible for how funds get onto the plasma chain.

* ExitHandler

  The exit handler is in general responsible for how funds leave the plasma chain.

![Inheritance chain](./img/inheritnace.png)

## LICENSE

Project source files are made available under the terms of the Mozilla Public License (MPLv2). See individual files for details.
