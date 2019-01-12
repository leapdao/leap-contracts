export { default as EVMRevert } from './EVMRevert';
export { default as assertThrows } from './assertThrows';
export { default as assertRevert } from './assertRevert';
export { default as submitNewPeriodWithTx } from './submitNewPeriodWithTx';

export const log = (...msg) => {
  if (process.env.npm_lifecycle_event === 'test') return;
  console.log(...msg); // eslint-disable-line no-console
};