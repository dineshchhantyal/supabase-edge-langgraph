// src/server/env.ts
// Helpers for reading environment variables in both Deno and Node runtimes.

export function readEnv(name: string): string | undefined {
  const globalEnv = globalThis as typeof globalThis & {
    Deno?: { env?: { get?(name: string): string | undefined } };
  };

  try {
    const denoValue = globalEnv.Deno?.env?.get?.(name);
    if (denoValue !== undefined) {
      return denoValue;
    }
  } catch {
    // Ignore Deno permission errors.
  }

  if (typeof process !== "undefined" && process?.env && name in process.env) {
    return process.env[name];
  }

  return undefined;
}

export function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
