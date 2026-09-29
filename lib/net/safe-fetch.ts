import "server-only";

import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { Readable } from "node:stream";
import { isPublicAddress } from "./address";

/* The SSRF guard (feature 18): the only way server code fetches a URL a
   user typed. Rules:
   - http and https only, and no credentials in the URL;
   - every address the host resolves to must be public (no loopback,
     private, link-local — e.g. the cloud metadata 169.254.169.254 — or
     other reserved ranges). The check runs inside the socket's own DNS
     lookup, so the address that's checked is the one connected to: a
     rebinding DNS server can't swap in a private address afterwards;
   - redirects are followed by hand (at most 5), each hop checked again;
   - 15 seconds and 10 MB in total, HTML only.
   Errors are SafeFetchError, whose message the user can read. */

export class SafeFetchError extends Error {
  override name = "SafeFetchError";
}

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /* Injected in tests; defaults to the system resolver. */
  resolve?: (hostname: string) => Promise<LookupAddress[]>;
}

export interface SafeFetchResult {
  /* The final URL, after redirects. */
  url: string;
  contentType: string;
  body: string;
}

const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const HTML_TYPES = ["text/html", "application/xhtml+xml"];

const systemResolve = (hostname: string) =>
  new Promise<LookupAddress[]>((resolve, reject) =>
    dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => (err ? reject(err) : resolve(addresses))),
  );

/* Throws unless `raw` is an http(s) URL whose host is allowed on its face.
   Hostnames are checked again at connect time (see guardedLookup). */
export function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new SafeFetchError("That doesn't look like a web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchError("Only http and https links can be added.");
  }
  if (url.username || url.password) throw new SafeFetchError("Links with a username or password can't be added.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host)) throw new SafeFetchError(blockedMessage);
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new SafeFetchError(blockedMessage);
  }
  return url;
}

const blockedMessage = "That address points inside a private network, so it can't be fetched.";

/* A DNS lookup for the socket that refuses non-public addresses. */
function guardedLookup(resolve: (hostname: string) => Promise<LookupAddress[]>): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname).then(
      (addresses) => {
        if (addresses.length === 0) return callback(new SafeFetchError(`"${hostname}" couldn't be found.`), "", 0);
        if (addresses.some((a) => !isPublicAddress(a.address))) return callback(new SafeFetchError(blockedMessage), "", 0);
        if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addresses);
        callback(null, addresses[0].address, addresses[0].family);
      },
      () => callback(new SafeFetchError(`"${hostname}" couldn't be found. Check the address.`), "", 0),
    );
  };
}

export async function safeFetchHtml(raw: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  const deadline = Date.now() + (opts.timeoutMs ?? TIMEOUT_MS);
  const lookup = guardedLookup(opts.resolve ?? systemResolve);
  let url = checkUrl(raw);

  for (let hop = 0; hop <= (opts.maxRedirects ?? MAX_REDIRECTS); hop++) {
    const res = await request(url, lookup, deadline);
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      url = checkUrl(new URL(res.headers.location, url).toString());
      continue;
    }
    if (status < 200 || status >= 300) {
      res.resume();
      throw new SafeFetchError(`The page answered with an error (${status}). Check the link.`);
    }
    const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
    if (!HTML_TYPES.some((t) => contentType.startsWith(t))) {
      res.resume();
      throw new SafeFetchError("That link isn't a web page (HTML). Upload the file itself instead.");
    }
    const declared = Number(res.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
      res.resume();
      throw new SafeFetchError(tooBig(maxBytes));
    }
    const bytes = await readCapped(decoded(res), maxBytes, deadline);
    return { url: url.toString(), contentType, body: decode(bytes, contentType) };
  }
  throw new SafeFetchError("That link redirects too many times.");
}

function request(url: URL, lookup: LookupFunction, deadline: number): Promise<IncomingMessage> {
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: "GET",
        lookup,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; StudyhallBot/1.0)",
          accept: "text/html,application/xhtml+xml;q=0.9",
          "accept-encoding": "gzip, deflate, br",
        },
        timeout: Math.max(1, deadline - Date.now()),
      },
      resolve,
    );
    req.on("timeout", () => req.destroy(new SafeFetchError(timedOut)));
    req.on("error", (err) =>
      reject(err instanceof SafeFetchError ? err : new SafeFetchError("The page couldn't be reached. Check the link and try again.")),
    );
    req.end();
  });
}

const timedOut = "The page took too long to answer (over 15 seconds).";
const tooBig = (max: number) => `That page is over ${Math.round(max / 1024 / 1024)} MB, which is too big to add.`;

function decoded(res: IncomingMessage): Readable {
  switch (String(res.headers["content-encoding"] ?? "").toLowerCase()) {
    case "gzip":
      return res.pipe(createGunzip());
    case "deflate":
      return res.pipe(createInflate());
    case "br":
      return res.pipe(createBrotliDecompress());
    default:
      return res;
  }
}

/* The cap counts decompressed bytes, so a small gzip bomb can't get past it. */
async function readCapped(stream: Readable, maxBytes: number, deadline: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  const timer = setTimeout(() => stream.destroy(new SafeFetchError(timedOut)), Math.max(1, deadline - Date.now()));
  try {
    for await (const chunk of stream) {
      size += (chunk as Buffer).length;
      if (size > maxBytes) {
        stream.destroy();
        throw new SafeFetchError(tooBig(maxBytes));
      }
      chunks.push(chunk as Buffer);
    }
  } catch (err) {
    throw err instanceof SafeFetchError ? err : new SafeFetchError("The page stopped loading part-way. Try again.");
  } finally {
    clearTimeout(timer);
  }
  return Buffer.concat(chunks);
}

function decode(bytes: Buffer, contentType: string): string {
  const charset = /charset=([^;]+)/.exec(contentType)?.[1]?.trim().replace(/"/g, "") ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}
