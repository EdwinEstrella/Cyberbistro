export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => unknown
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(onTimeout());
      }, ms);
      if (typeof timer === "object" && timer !== null && "unref" in timer && typeof (timer as NodeJS.Timeout).unref === "function") {
        (timer as NodeJS.Timeout).unref();
      }
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
