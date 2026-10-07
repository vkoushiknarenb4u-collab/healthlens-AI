import { randomUUID } from 'node:crypto';

const sessionLifetime = 60 * 60 * 1000;
const sessions = new Map();

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
}, 5 * 60 * 1000);
cleanupTimer.unref();

export function createReportSession(report) {
  const id = randomUUID();
  sessions.set(id, { report, expiresAt: Date.now() + sessionLifetime });
  return id;
}

export function getReportSession(id) {
  const session = sessions.get(id);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(id);
    return null;
  }
  return session.report;
}

export function deleteReportSession(id) {
  sessions.delete(id);
}
