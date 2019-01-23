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
  period.setValidatorData(0, '0x0000000000000000000000000000000000000000');
  const newPeriodRoot = period.proof(txs[0])[0];

  await bridge.submitPeriod(prevPeriodRoot, newPeriodRoot, opts).should.be.fulfilled;
  return period;
};