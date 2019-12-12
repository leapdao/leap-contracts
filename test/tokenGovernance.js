import chai from 'chai';
import EVMRevert from './helpers/EVMRevert';

const NativeToken = artifacts.require('NativeToken');
const TokenGovernance = artifacts.require('TokenGovernance');

chai.use(require('chai-as-promised')).should();

contract('TokenGovernance', (accounts) => {

  let gov;
  let leapToken;
  const proposalHash = '0x1122334411223344112233441122334411223344112233441122334411223344';
  const proposalStake = '5000000000000000000000';

  beforeEach(async () => {
    leapToken = await NativeToken.new("Leap Token", "Leap", 18);
    leapToken.mint(accounts[0], proposalStake);
    gov = await TokenGovernance.new(accounts[0], leapToken.address);
  });


  it('should fail if funds not approved', async () => {
    // register proposal
    await gov.registerProposal(proposalHash).should.be.rejectedWith(EVMRevert);
  });

  it('should allow to create proposal', async () => {
    // allow gov contract to pull funds
    leapToken.approve(gov.address, proposalStake);
    // register proposal
    await gov.registerProposal(proposalHash);
    // read proposal
    const rsp = await gov.proposals(proposalHash);
    assert(rsp.openTime > 0);

    // check that same proposal can not be rigestered twice
    leapToken.mint(accounts[0], proposalStake);
    leapToken.approve(gov.address, proposalStake);
    await gov.registerProposal(proposalHash).should.be.rejectedWith(EVMRevert);
  });

});
