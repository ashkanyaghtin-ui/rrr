import { getDoc, getDocs } from 'firebase/firestore';

const DEFAULT_POLL_MS = 4000;

/**
 * Safe replacement for Firestore onSnapshot that uses polling instead of watch streams.
 * This avoids internal watch-stream assertion crashes while keeping data reasonably fresh.
 */
export function safeOnSnapshot(
  ref: any,
  onNext: (snapshot: any) => void,
  onError?: (error: unknown) => void,
  pollMs: number = DEFAULT_POLL_MS,
): () => void {
  let stopped = false;

  const fetchOnce = async () => {
    try {
      let snapshot: any;
      try {
        snapshot = await getDocs(ref);
      } catch {
        snapshot = await getDoc(ref);
      }
      if (!stopped) {
        onNext(snapshot);
      }
    } catch (error) {
      if (onError) {
        onError(error);
      } else {
        console.error('safeOnSnapshot polling error:', error);
      }
    }
  };

  void fetchOnce();
  const timer = window.setInterval(() => {
    void fetchOnce();
  }, pollMs);

  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}
