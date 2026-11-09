import 'server-only';
import { retryRetiredObjects } from '@/lib/file-store';
import { moveLegacyFiles } from '@/lib/legacy-files';

const RETRY_INTERVAL_MS = 10 * 60_000;

const state = globalThis as unknown as { sekaiJobsStarted?: boolean };

/** Background work of the server process: the one-off legacy move, then retrying failed deletions. */
export function startBackgroundJobs() {
  if (state.sekaiJobsStarted) return;
  state.sekaiJobsStarted = true;
  setTimeout(async () => {
    try {
      const result = await moveLegacyFiles();
      if (result.moved || result.cleared || result.failed) console.log('legacy files', result);
    } catch (err) {
      console.error('legacy file move failed', err);
    }
  }, 3_000);
  const timer = setInterval(async () => {
    try {
      const n = await retryRetiredObjects();
      if (n) console.log(`deleted ${n} retired object(s)`);
    } catch (err) {
      console.error('retired object retry failed', err);
    }
  }, RETRY_INTERVAL_MS);
  timer.unref();
}
