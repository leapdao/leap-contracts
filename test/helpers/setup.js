import chai from 'chai';
import chaiBigNumber from 'chai-bignumber';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised).use(chaiBigNumber(web3.BigNumber)).should();