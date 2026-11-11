export function createAuthSessionSync<T>(applySession: (session: T) => void) {
  let revision = 0;
  return {
    get revision() { return revision; },
    fromAuthEvent(session: T) {
      revision += 1;
      applySession(session);
    },
    applySnapshotIfCurrent(startingRevision: number, session: T) {
      if (revision !== startingRevision) return false;
      applySession(session);
      return true;
    },
  };
}
