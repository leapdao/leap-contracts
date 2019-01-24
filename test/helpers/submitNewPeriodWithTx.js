import { Period, Block } from 'leap-core';

export default async (txs, bridge, opts) => {
  // create block
  const block = txs.reduce(
    (b, tx) => b.addTx(tx),
    new Block(33)
  );
  
  // create new period
  const prevPeriodRoot = await bridge.tipHash();
  const period = new Period(prevPeriodRoot, [block]);
  let slotId = 0;
  let signerAddr = '0x0000000000000000000000000000000000000000';
  if (opts.slotId) {
    { slotId } = opts;
  }
  if (opts.signerAddr) {
    { signerAddr } = opts;
  }
  period.setValidatorData(slotId, signerAddr);
  const newPeriodRoot = period.proof(txs[0])[0];

  await bridge.submitPeriod(prevPeriodRoot, newPeriodRoot, opts).should.be.fulfilled;
  return period;
};