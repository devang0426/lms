import type { ReactNode } from "react";
import { Card, EmptyState, Eyebrow } from "@/components/ui";

/* App-shell page header: mono eyebrow above a serif H1 on the left,
   actions on the right. */
export function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="m-0 font-serif text-[36px] leading-[1.1] font-normal md:text-[48px]">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

/* Styled stand-in for pages whose real content lands in a later feature. */
export function PlaceholderPage({
  eyebrow,
  title,
  message,
  feature,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  message: ReactNode;
  feature: string;
}) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} />
      <Card padded={false} className="border-dashed">
        <EmptyState title="Coming soon" description={message} action={<Eyebrow>Feature {feature}</Eyebrow>} />
      </Card>
    </>
  );
}
