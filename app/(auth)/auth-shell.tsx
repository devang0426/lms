import type { ReactNode } from "react";

/* Sign-in / sign-up split layout from wireframe 01: Clay-tint hero panel on
   the left, the form centred on the right. Feature 03 adds the demo account
   picker above the form. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="relative m-4 hidden flex-col justify-between overflow-hidden rounded-panel bg-clay p-12 lg:m-5 lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex size-[34px] items-center justify-center rounded-[9px] bg-terracotta font-serif text-[22px] text-cream italic">
            s
          </div>
          <span className="font-serif text-[26px]">Studyhall</span>
        </div>
        <div aria-hidden className="absolute top-[150px] -right-[120px] size-[420px] rounded-full bg-butter opacity-55" />
        <div aria-hidden className="absolute top-[380px] right-[120px] size-[220px] rounded-full bg-sage-tint" />
        <div className="relative flex flex-col gap-5">
          <h1 className="m-0 font-serif text-[84px] leading-[0.95] font-normal tracking-[-0.02em]">
            Learn something
            <br />
            <em className="text-terracotta">worth keeping.</em>
          </h1>
          <p className="m-0 max-w-[420px] text-[17px] leading-[1.55] text-ink-soft">
            Lectures, notes and a study assistant that shows you exactly where each idea was
            taught.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-12">
        <div className="flex w-full max-w-[400px] flex-col gap-5">{children}</div>
      </section>
    </div>
  );
}
