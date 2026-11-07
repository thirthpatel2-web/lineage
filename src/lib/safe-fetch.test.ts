import { describe, expect, it } from "vitest";
import { fetchPublicImage, isPublicAddress } from "./safe-fetch";

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "198.18.0.5", "224.0.0.1",
    "::1", "::", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a00:1", "64:ff9b::7f00:1", "64:ff9b::127.0.0.1",
    "2002:7f00:1::", "2001:db8::1", "::127.0.0.1",
  ])("blocks %s", (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each(["8.8.8.8", "151.101.1.140", "2606:4700:4700::1111", "::ffff:8.8.8.8", "64:ff9b::808:808"])("allows %s", (ip) => expect(isPublicAddress(ip)).toBe(true));
});

describe("fetchPublicImage", () => {
  it.each([
    "http://example.com/a.png",
    "https://127.0.0.1/a.png",
    "https://[::ffff:7f00:1]/a.png",
    "https://example.com:8443/a.png",
  ])("refuses %s before connecting", async (url) => {
    await expect(fetchPublicImage(url)).rejects.toThrow();
  });
});
