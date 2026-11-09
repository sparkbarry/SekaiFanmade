export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return;
  const { startBackgroundJobs } = await import('./lib/jobs');
  startBackgroundJobs();
  const { startMultiplay } = await import('./lib/multiplay/start');
  await startMultiplay();
}
