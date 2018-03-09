import request from 'request-promise-native'
import utils from 'ethereumjs-util'
import { Buffer } from 'safe-buffer'
import Transaction from '../chain/transaction'

export default class Client {

  constructor(childNodeUri = 'http://localhost:8080') {
    this.childNodeUri = childNodeUri
  }

  _call(method, params) {
    const opts = {
      url: this.childNodeUri,
      method: 'POST',
      headers: 'Content-type: application/json',
      json: true,
      body: {
        jsonrpc: '2.0',
        method: method,
        params: params,
        id: 1
      }
    }
    console.log(opts);
    return request(opts)
  }

  deposit(from, to, value) {
    const depositTx = new Transaction([
      new Buffer([]), // block number 1
      new Buffer([]), // tx number 1
      new Buffer([]), // previous output number 1 (input 1)
      new Buffer([]), // block number 2
      new Buffer([]), // tx number 2
      new Buffer([]), // previous output number 2 (input 2)

      utils.toBuffer(to), // output address 1
      value.toArrayLike(Buffer, 'be', 32), // value for output 2

      utils.zeros(20), // output address 2
      new Buffer([]), // value for output 2

      new Buffer([]) // fee
    ])

    const depositor = from
    const depositTxBytes = utils.bufferToHex(depositTx.serializeTx())

    // deposit
    const receipt = await rootChainContract.deposit(depositTxBytes, {
      gas: 200000,
      from: from,
      value: value.toString() // 1 value
    })
  }

  sendTx() {
    return this._call('plasma_sendTx', [])
  }

  getUTXOs(address) {
    return this._call('plasma_getUTXOs', [address]);
  }

  getMerkleProof() {

  }

}
