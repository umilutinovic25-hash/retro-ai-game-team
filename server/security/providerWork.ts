/**
 * Provider calls that lost a timeout/abort race but have not settled yet. `Promise.race` returns control to the
 * run, but the underlying call may keep working (or billing) if a transport ignores its AbortSignal. Admission
 * control counts these against the concurrency cap, so freeing a run's slot cannot let unfinished work pile up.
 */
const orphans = new Set<Promise<unknown>>();

export function adoptOrphanedProviderWork(work: Promise<unknown>): void {
  if (orphans.has(work)) return;
  orphans.add(work);
  const settle = () => { orphans.delete(work); };
  work.then(settle, settle);
}

export function orphanedProviderWork(): number {
  return orphans.size;
}
