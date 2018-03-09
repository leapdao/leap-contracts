import bip39 from 'bip39'
import hdkey from 'ethereumjs-wallet/hdkey'

const mnemonics = process.env.MNEMONIC || ""
const hdwallet = hdkey.fromMasterSeed(bip39.mnemonicToSeed(mnemonics))
const node = hdwallet.derivePath(`m/44'/60'/0'/0/0`)

export default node.getWallet();
