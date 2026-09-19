/**
 * One queue per room, so a room's actions are applied in order, one at a time.
 *
 * Nothing here is asynchronous yet, which is the point: when M8 adds a write to
 * SQLite the ordering guarantee is already in place instead of being retrofitted
 * around a race.
 */
export const createQueue = () => {
  const chains = new Map<string, Promise<unknown>>();

  return {
    run<T>(key: string, task: () => T | Promise<T>): Promise<T> {
      const previous = chains.get(key) ?? Promise.resolve();
      const next = previous.then(task, task);
      // Keep the chain alive even if a task rejected.
      chains.set(
        key,
        next.catch(() => undefined),
      );
      return next;
    },
    forget(key: string): void {
      chains.delete(key);
    },
  };
};
