/* When a click on a link loads another page of this app (feature 29, the
   pending bar): a plain left click on a same-origin http(s) link to a
   different path or query. Pure, so it's tested without a DOM. */

export interface ClickKeys {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export interface LinkTarget {
  href: string;
  /* The link's target attribute ("" when unset). */
  target: string;
  download: boolean;
}

export function isPageNavigation(click: ClickKeys, link: LinkTarget, here: Pick<Location, "href" | "origin" | "pathname" | "search">): boolean {
  if (click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  if (link.download || (link.target && link.target !== "_self")) return false;
  let to: URL;
  try {
    to = new URL(link.href, here.href);
  } catch {
    return false;
  }
  if (to.origin !== here.origin || !/^https?:$/.test(to.protocol)) return false;
  // Same page (or only its #hash): nothing loads.
  return to.pathname !== here.pathname || to.search !== here.search;
}
