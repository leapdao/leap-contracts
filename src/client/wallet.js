import bip39 from 'bip39'
import hdkey from 'ethereumjs-wallet/hdkey'

export default class Wallet {

  constructor(mnemonic) {
    this.hdwallet = hdkey.fromMasterSeed(bip39.mnemonicToSeed(mnemonic))
    // at some point we may need (?) a separate derivation path as per BIP44
    // 612 is arbitrary and free atm
    // reference: https://github.com/satoshilabs/slips/blob/master/slip-0044.md
    // for simplicity using just addresses of a single account, no change
    this.rootNode = this.hdwallet.derivePath("m/44'/612'/0'/0")
  }

  getAddress() {
    //require('thebugger')();
    return this.rootNode.deriveChild(0).getWallet().getAddress()
  }

}
