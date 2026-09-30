"use client";

import { useAuth, useClerk, useSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { startDemoSession } from "@/app/(auth)/demo-actions";
import { Field, Input } from "@/components/ui";
import { safeReturnPath } from "@/lib/utils/return-path";

export interface DemoAccountCard {
  key: string;
  name: string;
  label: string;
  shows: string;
  email: string;
  /* Left out behind a passcode (feature 24). */
  password: string | null;
}

/* One-click demo sign-in cards (DEMO_MODE only). Also shows the credentials
   so the presenter can type them into the normal form if they prefer.
   With a demo passcode set, it asks for the passcode and shows no
   password. After signing in it returns to the page that sent the
   visitor to sign-in (feature 34), like Clerk's own form. The landing
   page's "Try the demo" dialog leaves out the "or with email" divider,
   since no form follows it there. */
export function DemoAccountPicker({
  accounts,
  needsPasscode,
  emailDivider = true,
}: {
  accounts: DemoAccountCard[];
  needsPasscode: boolean;
  emailDivider?: boolean;
}) {
  const { signIn } = useSignIn();
  const { isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passcode, setPasscode] = useState("");

  async function continueAs(key: string) {
    if (needsPasscode && !passcode.trim()) {
      setError("Enter the demo passcode first.");
      return;
    }
    setPending(key);
    setError(null);
    try {
      // Checked before signing out, so a wrong passcode leaves the session alone.
      const res = await startDemoSession({ key, passcode: needsPasscode ? passcode : undefined });
      if (!res.ok) throw new Error(res.error.message);
      if (isSignedIn) await signOut();

      const { error: ticketError } = await signIn.ticket({ ticket: res.data.ticket });
      if (ticketError) throw new Error(ticketError.message);

      const { error: finalizeError } = await signIn.finalize({
        navigate: ({ decorateUrl }) => {
          const back = new URLSearchParams(window.location.search).get("redirect_url");
          const url = decorateUrl(safeReturnPath(back, window.location.origin));
          if (url.startsWith("http")) window.location.href = url;
          else router.push(url);
        },
      });
      if (finalizeError) throw new Error(finalizeError.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in to the demo account.");
      setPending(null);
    }
  }

  return (
    <section aria-labelledby="demo-heading" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 id="demo-heading" className="m-0 font-mono text-label text-ink-soft uppercase">
          Demo accounts
        </h2>
        <span className="text-meta text-ink-soft">{needsPasscode ? "Passcode, then one click" : "One click, no typing"}</span>
      </div>

      {needsPasscode && (
        <Field label="Demo passcode" htmlFor="demo-passcode" hint="Ask whoever gave you this link.">
          <Input
            id="demo-passcode"
            type="password"
            autoComplete="off"
            maxLength={200}
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            aria-describedby="demo-passcode-hint"
          />
        </Field>
      )}

      {accounts.map((a) => (
        <div key={a.key} className="flex flex-col gap-3 rounded-card border border-line bg-paper p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold">{a.name}</span>
              <span className="text-meta text-ink-soft">{a.shows}</span>
            </div>
            <span className="flex h-[26px] shrink-0 items-center rounded-full bg-clay px-2.5 text-[12px] font-medium text-clay-ink">
              {a.label}
            </span>
          </div>

          {a.password !== null && (
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-oat px-3 py-2 font-mono text-[12px]">
              <dt className="text-ink-soft">Email</dt>
              <dd className="m-0 truncate select-all">{a.email}</dd>
              <dt className="text-ink-soft">Password</dt>
              <dd className="m-0 select-all">{a.password}</dd>
            </dl>
          )}

          <button
            type="button"
            onClick={() => continueAs(a.key)}
            disabled={pending !== null}
            className="h-11 rounded-full bg-terracotta px-5 text-[15px] font-medium text-paper hover:bg-terracotta-hover disabled:opacity-60"
          >
            {pending === a.key ? "Signing in…" : `Continue as ${a.label.split(" ·")[0]}`}
          </button>
        </div>
      ))}

      {error && (
        <p role="alert" className="m-0 rounded-xl bg-clay px-3 py-2 text-meta text-clay-ink">
          {error}
        </p>
      )}

      {emailDivider && (
        <div className="flex items-center gap-3 pt-2 text-meta text-ink-soft">
          <span className="h-px grow bg-line" />
          or with email
          <span className="h-px grow bg-line" />
        </div>
      )}
    </section>
  );
}
