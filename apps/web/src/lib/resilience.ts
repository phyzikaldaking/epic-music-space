type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
};

type CircuitBreakerOptions = {
  failureThreshold?: number;
  cooldownMs?: number;
  halfOpenSuccesses?: number;
};

type CircuitState = "closed" | "open" | "half-open";

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

export class CircuitBreaker {
  private readonly label: string;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly halfOpenSuccesses: number;

  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private openedAt = 0;
  private halfOpenSuccessCount = 0;

  constructor(label: string, options: CircuitBreakerOptions = {}) {
    this.label = label;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.cooldownMs = options.cooldownMs ?? 15_000;
    this.halfOpenSuccesses = options.halfOpenSuccesses ?? 2;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const now = Date.now();

    if (this.state === "open") {
      if (now - this.openedAt < this.cooldownMs) {
        throw new Error(`[circuit:${this.label}] open`);
      }
      this.state = "half-open";
      this.halfOpenSuccessCount = 0;
    }

    try {
      const value = await operation();
      this.onSuccess();
      return value;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  getStatus() {
    return {
      label: this.label,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt,
    };
  }

  private onSuccess() {
    if (this.state === "half-open") {
      this.halfOpenSuccessCount += 1;
      if (this.halfOpenSuccessCount >= this.halfOpenSuccesses) {
        this.state = "closed";
        this.consecutiveFailures = 0;
        this.halfOpenSuccessCount = 0;
      }
      return;
    }

    this.consecutiveFailures = 0;
  }

  private onFailure() {
    if (this.state === "half-open") {
      this.trip();
      return;
    }

    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.trip();
    }
  }

  private trip() {
    this.state = "open";
    this.openedAt = Date.now();
    this.halfOpenSuccessCount = 0;
  }
}

const circuitBreakers = new Map<string, CircuitBreaker>();

function getCircuitBreaker(label: string, options?: CircuitBreakerOptions) {
  const existing = circuitBreakers.get(label);
  if (existing) return existing;
  const next = new CircuitBreaker(label, options);
  circuitBreakers.set(label, next);
  return next;
}

export async function withCircuitBreaker<T>(
  label: string,
  operation: () => Promise<T>,
  options?: CircuitBreakerOptions,
) {
  const breaker = getCircuitBreaker(label, options);
  return breaker.execute(operation);
}

export function getCircuitBreakerStatus(label: string) {
  return circuitBreakers.get(label)?.getStatus();
}

export function fireAndForget(promise: Promise<unknown>, label: string) {
  void promise.catch((error) => {
    console.warn(`[resilience] ${label} failed`, error);
  });
}
