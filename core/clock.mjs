const DAY_MS = 24 * 60 * 60 * 1000;

export function now() {
  return process.env.SPARRING_NOW ? new Date(process.env.SPARRING_NOW) : new Date();
}

export function today(date = now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).format(date);
}

export function addDays(dateString, n) {
  const base = new Date(`${dateString}T00:00:00Z`);
  return new Date(base.getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / DAY_MS);
}
