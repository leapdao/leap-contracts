const PlasmaRoot = artifacts.require('./PlasmaRoot.sol');

contract('PlasmaRoot', (accounts) => {

  it('should have owner', async () => {
    const plasmaRoot = await PlasmaRoot.new();
    const owner = await plasmaRoot.owner();
    assert.equal(owner, accounts[0]);
  });

});
