/* `npm run demo:reset` wipes the demo student's activity (feature 24, R10).
   Pointed at the wrong database it would wipe someone else's, so it runs
   only when every database URL it could use points at a host listed in
   DEMO_DB_HOSTS (comma-separated). A Neon host also covers its "-pooler"
   twin, so listing the direct host is enough. Pure: unit tested. */

export type ResetGuard = { ok: true; hosts: string[] } | { ok: false; reason: string };

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

const withoutPooler = (host: string) => host.replace(/-pooler(?=\.)/, "");

export function checkResetTarget(env: Record<string, string | undefined>): ResetGuard {
  const allowed = new Set(
    (env.DEMO_DB_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
  if (allowed.size === 0) {
    return { ok: false, reason: "DEMO_DB_HOSTS is empty. List the demo database's host there (see example.env)." };
  }

  const urls = [env.DATABASE_URL_POOLED, env.DATABASE_URL].map((u) => u?.trim()).filter((u): u is string => Boolean(u));
  if (urls.length === 0) return { ok: false, reason: "No DATABASE_URL is set." };

  const hosts: string[] = [];
  for (const url of urls) {
    const host = hostOf(url);
    if (!host) return { ok: false, reason: "A DATABASE_URL can't be read as a URL." };
    if (!allowed.has(host) && !allowed.has(withoutPooler(host))) {
      return { ok: false, reason: `${host} isn't in DEMO_DB_HOSTS, so it isn't a demo database.` };
    }
    hosts.push(host);
  }
  return { ok: true, hosts };
}
