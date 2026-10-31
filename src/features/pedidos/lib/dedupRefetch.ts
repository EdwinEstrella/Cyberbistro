/**
 * Creates a deduped refetch runner. If a refetch is already in flight,
 * concurrent calls coalesce into the single existing in-flight promise
 * instead of making duplicate parallel network queries.
 */
export function createDedupedRefetch<T = void>(refetchFn: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return () => {
    if (inFlight) {
      return inFlight;
    }

    inFlight = refetchFn().finally(() => {
      inFlight = null;
    });

    return inFlight;
  };
}
