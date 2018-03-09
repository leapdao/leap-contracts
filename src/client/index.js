import Client from './client'
import Cli from './cli'
import Wallet from './wallet'

const CLIENT_CONFIG = {
  childNodeUri: 'http://localhost:8080',
  mnemonic:
}

const wallet = new Wallet()

const client = new Client(CLIENT_CONFIG.childNodeUri)
new Cli(client, wallet)
