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
        .command('address [index]', 'Get address on Plasma chain')
        .action(function(args, callback) {
          console.log(wallet.getAddress(args.index))
          callback()
        })

      this.vorpal
        .command('balance', 'Get your balance on the Plasma chain')
        .action(async function(args, callback) {
          const address = wallet.getAddress()
          const utxos = await client.getUTXOs(address)
          const balance = utxos.map(utxo => {
            let txBalance = 0
            if (wallet.isOur(utxo.tx.newowner1)) {
              txBalance += parseInt(utxo.tx.amount1)
            }

            if (wallet.isOur(utxo.tx.newowner2)) {
              txBalance += parseInt(utxo.tx.amount2)
            }
            return txBalance;
          }).reduce((sum, txBal) => { sum += txBal; return sum }, 0)
          console.log(`${Web3.utils.fromWei(new BN(balance))} PETH`);
          callback()
        })

      this.vorpal
        .command('utxos [address]', 'Get UTXOs for address')
        .types({
          string: ['_']
        })
        .action(async function(args, callback) {
          const address = Web3.utils.numberToHex(args.address) || wallet.getAddress()
          console.log(await client.getUTXOs(address))
          callback()
        })

      this.vorpal
        .command('deposit <value>', 'Deposit ETH to Plasma chain (PETH)')
        .action(function(args, callback) {
          const plasmaAddress = utils.toBuffer(wallet.getAddress())
          client.deposit(plasmaAddress, new BN(args.value))
          callback()
        })

      this.vorpal
        .delimiter(`> `)
        .show()
    }

}
