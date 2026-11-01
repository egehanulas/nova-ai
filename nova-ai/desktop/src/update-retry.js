export const UPDATE_RETRY_DELAYS_MS = Object.freeze([
  30_000,
  2 * 60 * 1000,
  10 * 60 * 1000,
  30 * 60 * 1000
]);

export function createUpdateRetryScheduler({
  onRetry,
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) {
  let attempt = 0;
  let timer = null;

  function cancel() {
    if (timer === null) return;
    clearTimer(timer);
    timer = null;
  }

  function reset() {
    cancel();
    attempt = 0;
  }

  function schedule() {
    if (timer !== null) return null;

    const delay = UPDATE_RETRY_DELAYS_MS[Math.min(attempt, UPDATE_RETRY_DELAYS_MS.length - 1)];
    attempt = Math.min(attempt + 1, UPDATE_RETRY_DELAYS_MS.length - 1);
    timer = setTimer(() => {
      timer = null;
      if (typeof onRetry === "function") onRetry();
    }, delay);
    timer?.unref?.();
    return delay;
  }

  return Object.freeze({
    schedule,
    cancel,
    reset,
    get pending() {
      return timer !== null;
    }
  });
}
