import Vorpal from 'vorpal'

export default class Cli {
    constructor(client) {
      this.client = client

      this.vorpal = new Vorpal()

      this.vorpal
        .command('getUTXOs <address>', 'Get UTXOs for address')
        .action(function(args, callback) {
          client.getUTXOs(args.address)
          callback()
        })

      this.vorpal
        .delimiter(`> `)
        .show()
    }

}
