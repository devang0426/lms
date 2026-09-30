import { Mail, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { Button, Eyebrow, Icon, Logo } from "@/components/ui";
import { telHref, type Institute } from "@/lib/institute";

/* Header and footer of the public pages (feature 34): the landing page,
   privacy and terms. No account menu or bell: nobody is signed in here
   (a signed-in visitor on /welcome is sent home by proxy.ts). */

export const PUBLIC_WIDTH = "mx-auto w-full max-w-[1200px] px-5 md:px-10";

export function SiteHeader({ institute }: { institute: Institute }) {
  return (
    <header className="border-b border-line">
      <div className={`${PUBLIC_WIDTH} flex h-[72px] items-center justify-between gap-4`}>
        <Link href="/welcome" aria-label={`${institute.name} on Studyhall, home`} className="text-ink no-underline hover:text-ink">
          <Logo size="sm" />
        </Link>
        <nav aria-label="Site" className="flex items-center gap-1 md:gap-2">
          <Link href="/welcome#features" className="hidden rounded-full px-3 py-2 text-[15px] text-ink-soft no-underline hover:text-ink md:inline">
            What you get
          </Link>
          <Link href="/welcome#join" className="hidden rounded-full px-3 py-2 text-[15px] text-ink-soft no-underline hover:text-ink md:inline">
            How to join
          </Link>
          <Button asChild variant="quiet" size="sm">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

export function ContactLinks({ institute, className }: { institute: Institute; className?: string }) {
  const { email, phone, address } = institute;
  return (
    <ul className={`m-0 flex list-none flex-col gap-2.5 p-0 text-small ${className ?? ""}`}>
      {email && (
        <li className="flex items-center gap-2.5">
          <Icon icon={Mail} size={16} className="shrink-0 text-ink-soft" />
          <a href={`mailto:${email}`}>{email}</a>
        </li>
      )}
      {phone && (
        <li className="flex items-center gap-2.5">
          <Icon icon={Phone} size={16} className="shrink-0 text-ink-soft" />
          <a href={telHref(phone)}>{phone}</a>
        </li>
      )}
      {address && (
        <li className="flex items-start gap-2.5 text-ink-soft">
          <Icon icon={MapPin} size={16} className="mt-0.5 shrink-0" />
          <span>{address}</span>
        </li>
      )}
    </ul>
  );
}

export function SiteFooter({ institute }: { institute: Institute }) {
  return (
    // Cream, not Oat: Terracotta links on Oat fall below AA contrast (4.3:1).
    <footer className="mt-16 border-t border-line">
      <div className={`${PUBLIC_WIDTH} grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]`}>
        <div className="flex flex-col gap-3">
          <Logo size="sm" />
          <p className="m-0 max-w-[340px] text-small text-ink-soft">
            Studyhall is where {institute.name} students watch lectures, study and hand in their work.
          </p>
        </div>
        <section aria-labelledby="footer-contact" className="flex flex-col gap-3">
          <h2 id="footer-contact" className="m-0">
            <Eyebrow>Contact the office</Eyebrow>
          </h2>
          <ContactLinks institute={institute} />
        </section>
        <nav aria-labelledby="footer-links" className="flex flex-col gap-3">
          <h2 id="footer-links" className="m-0">
            <Eyebrow>Studyhall</Eyebrow>
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-small">
            <li>
              <Link href="/privacy">Privacy</Link>
            </li>
            <li>
              <Link href="/terms">Terms</Link>
            </li>
            <li>
              <Link href="/sign-in">Sign in</Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
