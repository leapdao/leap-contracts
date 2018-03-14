import Vorpal from 'vorpal'
import utils from 'ethereumjs-util'
import Web3 from 'web3'

const BN = utils.BN

export default class Cli {
    constructor(client, wallet) {
      this.client = client
      this.wallet = wallet

      this.vorpal = new Vorpal()

      this.vorpal
        .command('address', 'Get address on Plasma chain')
        .action(function(args, callback) {
          console.log(utils.bufferToHex(wallet.getAddress()))
          callback()
        })

      this.vorpal
        .command('utxos [address]', 'Get UTXOs for address')
        .types({
          string: ['_']
        })
        .action(async function(args, callback) {
          const address = Web3.utils.numberToHex(args.address) || utils.bufferToHex(wallet.getAddress())
          console.log(await client.getUTXOs(address))
          callback()
        })

      this.vorpal
        .command('deposit <value>', 'Deposit ETH to Plasma chain')
        .action(function(args, callback) {
          const plasmaAddress = wallet.getAddress()
          client.deposit(plasmaAddress, new BN(args.value))
          callback()
        })

      this.vorpal
        .delimiter(`> `)
        .show()
    }

}
