const duration = {
  seconds (val) { return val; },
  minutes (val) { return val * this.seconds(60); },
  hours (val) { return val * this.minutes(60); },
  days (val) { return val * this.hours(24); },
  weeks (val) { return val * this.days(7); },
  years (val) { return val * this.days(365); },
};

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const durationToString = (durationSec) => {
  const days = Math.trunc(durationSec / DAY); 
  const hours = Math.trunc((durationSec - days * DAY) / HOUR); 
  const minutes = Math.trunc((durationSec - days * DAY - hours * HOUR) / MINUTE); 
  const seconds = Math.trunc(durationSec - days * DAY - hours * HOUR - minutes * MINUTE); 
  
  const durationParts = [];
  if (days) durationParts.push(`${days} days`);
  if (hours) durationParts.push(`${hours} hours`);
  if (minutes) durationParts.push(`${minutes} minutes`);
  if (seconds) durationParts.push(`${seconds} seconds`);

  return durationParts.join(', ');
};

module.exports = {
  duration,
  durationToString,
};
