const CALLBACK = {
  protocol: 'eyrionai:',
  hostname: 'auth',
  pathname: '/callback',
};
const MAX_CODE_LENGTH = 4096;

export function parseAuthCallback(url: string) {
  if (url.length > 8192) throw new Error('Auth callback URL is too long.');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Auth callback URL is malformed.');
  }

  if (
    parsed.protocol !== CALLBACK.protocol || parsed.hostname !== CALLBACK.hostname ||
    parsed.pathname !== CALLBACK.pathname || parsed.username || parsed.password || parsed.port ||
    parsed.hash || url.includes('#') || Array.from(parsed.searchParams.keys()).length !== 1
  ) {
    throw new Error('Unexpected auth callback URL.');
  }

  const codes = parsed.searchParams.getAll('code');
  if (codes.length !== 1 || !codes[0] || codes[0].length > MAX_CODE_LENGTH || /[\s\u0000-\u001f\u007f]/.test(codes[0])) {
    throw new Error('Invalid auth callback code.');
  }
  return { code: codes[0] };
}

export function createAuthLinkQueue(handleCode: (code: string) => Promise<void>) {
  let releaseHydration!: () => void;
  const hydrated = new Promise<void>((resolve) => { releaseHydration = resolve; });
  let tail = Promise.resolve();
  const queued = new Map<string, Promise<void>>();

  return {
    sessionLoaded() { releaseHydration(); },
    enqueue(url: string) {
      const existing = queued.get(url);
      if (existing) return existing;
      const task = tail.then(() => hydrated).then(() => handleCode(parseAuthCallback(url).code));
      queued.set(url, task);
      tail = task.catch(() => undefined);
      if (queued.size > 20) queued.delete(queued.keys().next().value as string);
      return task;
    },
    flush() { return tail; },
  };
}
