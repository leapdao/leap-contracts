import Web3 from 'web3'
import Client from './client'
import Cli from './cli'
import Wallet from './wallet'
import config from '../config'

const wallet = new Wallet(config.client.mnemonic)

const client = new Client(
  new Web3(config.client.web3Provider),
  wallet,
  config.client.childNodeUri,
  config.client.rootChainContract
)

new Cli(client, wallet)
