export interface OutputOptions {
  pretty?: boolean;
}

export function emit(payload: unknown, opts: OutputOptions = {}): void {
  const json = opts.pretty
    ? JSON.stringify(payload, null, 2)
    : JSON.stringify(payload);
  process.stdout.write(`${json}\n`);
}

export function fail(message: string, extra: Record<string, unknown> = {}, exitCode = 1): never {
  const payload = { ok: false, error: message, ...extra };
  process.stderr.write(`${JSON.stringify(payload)}\n`);
  process.exit(exitCode);
}
