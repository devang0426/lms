import { describe, expect, it } from "vitest";
import { isPublicAddress } from "./address";
import { checkUrl, safeFetchHtml, SafeFetchError } from "./safe-fetch";

describe("isPublicAddress", () => {
  it("refuses loopback, private, link-local and other reserved IPv4", () => {
    for (const ip of [
      "127.0.0.1",
      "127.8.8.8",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.10",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
      "198.18.0.1",
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("accepts public IPv4, including neighbours of the blocked ranges", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.15.255.255", "172.32.0.1", "169.253.1.1", "100.128.0.1", "93.184.216.34"]) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });

  it("refuses reserved IPv6 and IPv4 hidden inside IPv6", () => {
    for (const ip of [
      "::1",
      "::",
      "fe80::1",
      "fc00::1",
      "fd12:3456::1",
      "ff02::1",
      "::ffff:127.0.0.1",
      "::ffff:169.254.169.254",
      "::ffff:a9fe:a9fe",
      "64:ff9b::a9fe:a9fe",
      "2001:db8::1",
      "2002:7f00:1::",
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("accepts public IPv6 and public IPv4-mapped addresses", () => {
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
  });

  it("refuses things that aren't addresses", () => {
    expect(isPublicAddress("localhost")).toBe(false);
    expect(isPublicAddress("")).toBe(false);
  });
});

describe("checkUrl", () => {
  it("allows only http and https without credentials", () => {
    expect(checkUrl("https://example.org/notes").hostname).toBe("example.org");
    for (const bad of ["ftp://example.org/", "file:///etc/passwd", "javascript:alert(1)", "https://user:pw@example.org/", "not a url"]) {
      expect(() => checkUrl(bad), bad).toThrow(SafeFetchError);
    }
  });

  it("refuses private hosts written literally", () => {
    for (const bad of ["http://169.254.169.254/", "http://localhost", "http://localhost:3000/x", "http://127.0.0.1/", "http://10.1.2.3/", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://db.internal/"]) {
      expect(() => checkUrl(bad), bad).toThrow(/private network/);
    }
  });
});

describe("safeFetchHtml", () => {
  const resolvesTo = (address: string, family = 4) => async () => [{ address, family }];

  it("refuses http://169.254.169.254/ (cloud metadata) and http://localhost without connecting", async () => {
    await expect(safeFetchHtml("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(/private network/);
    await expect(safeFetchHtml("http://localhost")).rejects.toThrow(/private network/);
    await expect(safeFetchHtml("http://192.168.0.1/admin")).rejects.toThrow(/private network/);
  });

  it("refuses a public-looking name that resolves to a private address", async () => {
    for (const [address, family] of [["10.0.0.5", 4], ["127.0.0.1", 4], ["169.254.169.254", 4], ["::1", 6]] as const) {
      await expect(safeFetchHtml("http://rebind.example.com/", { resolve: resolvesTo(address, family) }), address).rejects.toThrow(
        /private network/,
      );
    }
  });

  it("refuses when any one of the resolved addresses is private", async () => {
    const mixed = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ];
    await expect(safeFetchHtml("http://mixed.example.com/", { resolve: mixed })).rejects.toThrow(/private network/);
  });

  it("says so when the host doesn't exist", async () => {
    const none = async () => {
      throw new Error("ENOTFOUND");
    };
    await expect(safeFetchHtml("https://no-such-host.example/", { resolve: none })).rejects.toThrow(/couldn't be found/);
  });
});
