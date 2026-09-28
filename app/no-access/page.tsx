import Link from "next/link";

export default function NoAccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="flex max-w-[440px] flex-col items-center gap-4 text-center">
        <span className="font-mono text-label text-ink-soft uppercase">403 · No access</span>
        <h1 className="m-0 font-serif text-h1 font-normal">
          This room is <em>locked.</em>
        </h1>
        <p className="m-0 text-body text-ink-soft">
          Your account doesn&apos;t have access to that page. If you think it should, ask your
          instructor or the university admin.
        </p>
        <Link
          href="/"
          className="flex h-12 items-center rounded-full bg-terracotta px-[22px] text-[15px] font-medium text-paper no-underline hover:bg-terracotta-hover hover:text-paper"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
