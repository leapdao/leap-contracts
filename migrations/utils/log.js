module.exports = (...msg) => {
  if (process.env.npm_lifecycle_event === 'test') return;
  console.log(...msg); // eslint-disable-line no-console
};