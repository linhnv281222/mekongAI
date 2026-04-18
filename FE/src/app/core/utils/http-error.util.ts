export function httpErrorMessage(err: unknown, fallback: string): string {
  const e = err as {
    error?: { result?: { message?: string }; message?: string };
    message?: string;
  };
  return e?.error?.result?.message ?? e?.error?.message ?? e?.message ?? fallback;
}
