import 'server-only';
import { releaseOrphanFiles, retryRetiredObjects } from '@/lib/file-store';
import { splitPackages } from '@/lib/package-split';

const RETRY_INTERVAL_MS = 10 * 60_000;

const state = globalThis as unknown as { sekaiJobsStarted?: boolean };

/** Background work of the server process: splitting old ZIP packages once, retrying object deletions that failed. */
export function startBackgroundJobs() {
  if (state.sekaiJobsStarted) return;
  state.sekaiJobsStarted = true;
  const run = async () => {
    try {
      const n = await retryRetiredObjects();
      if (n) console.log(`deleted ${n} retired object(s)`);
    } catch (err) {
      console.error('retired object retry failed', err);
    }
    try {
      const n = await releaseOrphanFiles();
      if (n) console.log(`released ${n} file(s) no chart refers to`);
    } catch (err) {
      console.error('orphan file release failed', err);
    }
  };
  setTimeout(async () => {
    try {
      const { split, failed } = await splitPackages();
      if (split || failed) console.log('package split', { split, failed });
    } catch (err) {
      console.error('package split failed', err);
    }
    await run();
  }, 10_000).unref();
  setInterval(run, RETRY_INTERVAL_MS).unref();
}
