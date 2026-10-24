/**
 * What weal-bot does when startup throws (a migration refusal, a bad config, Discord down
 * at boot): say why on stderr, so `docker logs` shows the reason for a crash loop; emit a
 * FATAL log; flush telemetry so that log reaches SigNoz (and Class A paging) instead of
 * dying in the batch buffer; then exit 1. orator-backend's entrypoint does the same.
 */
export interface StartupFailureDeps {
  stderr: (line: string) => void;
  emitFatal: (body: string) => void;
  shutdownTelemetry: () => Promise<unknown>;
  exit: (code: number) => void;
}

export async function failStartup(err: unknown, deps: StartupFailureDeps): Promise<void> {
  const body = `weal-bot failed to start: ${String(err)}`;
  deps.stderr(body);
  deps.emitFatal(body);
  try {
    await deps.shutdownTelemetry();
  } finally {
    deps.exit(1);
  }
}
