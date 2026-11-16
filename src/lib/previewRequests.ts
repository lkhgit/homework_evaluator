/**
 * Owns rewrite requests above the screens, keyed by the exact inputs they
 * were made for (the revision key).
 *
 * A request already in flight for a key is reused rather than repeated, so
 * leaving the preview and coming back, a re-render, or React's development
 * double-invoke never pays for a second rewrite. A result is delivered even if
 * nobody is looking at the preview any more; whether it is still current is
 * decided by its key where it is read, never here.
 */
export interface PreviewRequests<T> {
  /** Starts a request for `key` unless one is already running; returns it. */
  ensure(key: string): Promise<T>;
  isPending(key: string): boolean;
}

export function createPreviewRequests<T>(
  generate: (key: string) => Promise<T>,
  handlers: {
    onResult: (key: string, value: T) => void;
    onError: (key: string, error: unknown) => void;
    onPendingChange?: (pendingKeys: ReadonlySet<string>) => void;
  }
): PreviewRequests<T> {
  const inFlight = new Map<string, Promise<T>>();
  const notify = () => handlers.onPendingChange?.(new Set(inFlight.keys()));

  return {
    ensure(key) {
      const running = inFlight.get(key);
      if (running) return running;
      const request = generate(key).then(
        (value) => {
          inFlight.delete(key);
          notify();
          handlers.onResult(key, value);
          return value;
        },
        (error: unknown) => {
          inFlight.delete(key);
          notify();
          handlers.onError(key, error);
          throw error;
        }
      );
      // The caller may not await; a failure is already reported via onError.
      request.catch(() => undefined);
      inFlight.set(key, request);
      notify();
      return request;
    },
    isPending(key) {
      return inFlight.has(key);
    },
  };
}
