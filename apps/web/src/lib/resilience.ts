type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
};

export async function withTimeout<T>(
  promiseFactory: () => Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promiseFactory(), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 1;
  const baseDelayMs = options.baseDelayMs ?? 250;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      const backoffMs = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Operation failed");
}

export function fireAndForget(promise: Promise<unknown>, label: string) {
  void promise.catch((error) => {
    console.warn(`[resilience] ${label} failed`, error);
  });
}
