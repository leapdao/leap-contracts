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
  const newPeriodRoot = period.merkleRoot();

  await bridge.submitPeriod(prevPeriodRoot, newPeriodRoot, opts).should.be.fulfilled;
  return period;
};