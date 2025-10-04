import { createLogger } from './logger';

const logger = createLogger('backoff-controller');

type PauseEntry = {
  until: number;
  timer?: ReturnType<typeof setTimeout>;
  reason?: string;
};

const pauses = new Map<string, PauseEntry>();

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Pause processing for a user for at least `ms` milliseconds.
 * If there's an existing pause that's longer, it will not be shortened.
 */
export function pauseUserBackoff(
  userEmail: string,
  ms: number,
  reason?: string
) {
  try {
    const now = Date.now();
    const until = now + ms;
    const existing = pauses.get(userEmail);

    if (existing && existing.until >= until) {
      // existing pause is longer, keep it
      logger.debug('Existing pause longer than requested, keeping', {
        userEmail,
        existingUntil: existing.until,
        requestedUntil: until,
      });
      return;
    }

    // Clear previous timer
    if (existing?.timer) clearTimeout(existing.timer);

    const entry: PauseEntry = { until, reason };

    // Schedule cleanup
    entry.timer = setTimeout(() => {
      const cur = pauses.get(userEmail);
      if (cur && cur.until <= Date.now()) {
        pauses.delete(userEmail);
        logger.info('Backoff pause ended for user', { userEmail, reason });
      }
    }, ms + 50);

    pauses.set(userEmail, entry);

    logger.info('Backoff pause set for user', { userEmail, ms, reason });
  } catch (err) {
    logger.warn('Failed to set backoff pause', { userEmail, error: err });
  }
}

/**
 * Returns remaining pause milliseconds for the user (0 if none)
 */
export function getRemainingPauseMs(userEmail: string): number {
  const entry = pauses.get(userEmail);
  if (!entry) return 0;
  return Math.max(0, entry.until - Date.now());
}

/**
 * Wait while the user has an active pause. This resolves immediately if
 * there's no pause, otherwise waits until the pause ends. If the pause is
 * extended while waiting, this will continue waiting until the latest end.
 */
export async function waitWhilePaused(userEmail: string) {
  while (true) {
    const remaining = getRemainingPauseMs(userEmail);
    if (remaining <= 0) return;
    // Wait at most remaining ms, but loop in case pause is extended
    await sleep(remaining + 10);
  }
}

/**
 * Check whether the user is currently paused
 */
export function isUserPaused(userEmail: string): boolean {
  return getRemainingPauseMs(userEmail) > 0;
}

const BackoffController = {
  pauseUserBackoff,
  waitWhilePaused,
  getRemainingPauseMs,
  isUserPaused,
};

export default BackoffController;
