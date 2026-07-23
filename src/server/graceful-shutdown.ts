export interface ShutdownOutcome {
  timedOut: boolean;
  closeError?: unknown;
  cleanupError?: unknown;
}

export interface ShutdownOptions {
  closeServer: () => Promise<void>;
  closeOwnedResources: () => void;
  releaseOwnedLock: () => void;
  timeoutMs: number;
}

export interface ShutdownController {
  close(): Promise<ShutdownOutcome>;
}

export interface SignalProcess {
  exitCode?: number | string | null;
  on(signal: NodeJS.Signals, listener: () => void): unknown;
  removeListener(signal: NodeJS.Signals, listener: () => void): unknown;
  exit(code?: number): unknown;
}

export function registerGracefulSignalHandlers(
  shutdown: ShutdownController,
  signalProcess: SignalProcess = process,
): () => void {
  let signalShutdownStarted = false;
  const handlers = new Map<NodeJS.Signals, () => void>();
  const unregister = (): void => {
    for (const [signal, handler] of handlers) signalProcess.removeListener(signal, handler);
    handlers.clear();
  };

  for (const [signal, exitCode] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
    const handler = (): void => {
      if (signalShutdownStarted) return;
      signalShutdownStarted = true;
      void shutdown.close().then((outcome) => {
        unregister();
        signalProcess.exitCode = exitCode;
        if (outcome.timedOut || outcome.closeError || outcome.cleanupError) signalProcess.exit(exitCode);
      });
    };
    handlers.set(signal, handler);
    signalProcess.on(signal, handler);
  }

  return unregister;
}

export function createShutdownController(options: ShutdownOptions): ShutdownController {
  let shutdown: Promise<ShutdownOutcome> | undefined;

  const close = (): Promise<ShutdownOutcome> => {
    shutdown ??= (async () => {
      let timedOut = false;
      let closeError: unknown;
      let cleanupError: unknown;
      let timeout: NodeJS.Timeout | undefined;
      const deadline = new Promise<void>((resolve) => {
        timeout = setTimeout(() => {
          timedOut = true;
          resolve();
        }, options.timeoutMs);
      });

      try {
        await Promise.race([
          Promise.resolve().then(options.closeServer).catch((error: unknown) => {
            closeError = error;
          }),
          deadline,
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
        try {
          options.closeOwnedResources();
        } catch (error) {
          cleanupError = error;
        } finally {
          try {
            options.releaseOwnedLock();
          } catch (error) {
            cleanupError ??= error;
          }
        }
      }

      return { timedOut, closeError, cleanupError };
    })();
    return shutdown;
  };

  return { close };
}
