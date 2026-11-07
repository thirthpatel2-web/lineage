// Fetching an image from a URL an AI agent gave us. The URL could point anywhere, including this
// server's own network, so: https on port 443 only, every address checked, the connection pinned to
// the address we checked (no DNS rebinding), redirects re-checked hop by hop, and a hard size cap
// enforced while streaming.
import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const v4ToInt = (ip: string) => ip.split(".").reduce((n, part) => n * 256 + Number(part), 0);
const inV4 = (ip: string, base: string, bits: number) => {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((v4ToInt(ip) & mask) >>> 0) === ((v4ToInt(base) & mask) >>> 0);
};
const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

/** Expand any IPv6 text form (including "::" and an embedded IPv4 tail) to eight 16-bit numbers. */
function expandV6(ip: string): number[] | null {
  let text = ip.toLowerCase().split("%")[0];
  const tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const n = v4ToInt(tail[1]);
    text = text.slice(0, -tail[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, rest] = text.split("::");
  const a = head ? head.split(":") : [];
  const b = rest !== undefined && rest !== "" ? rest.split(":") : [];
  if (text.includes("::") ? a.length + b.length > 7 : a.length !== 8) return null;
  const groups = [...a, ...Array(8 - a.length - b.length).fill("0"), ...b].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : null;
}

const v4FromGroups = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

/** True only for globally routable unicast addresses. */
export function isPublicAddress(address: string): boolean {
  const kind = isIP(address.split("%")[0]);
  if (kind === 4) return !V4_BLOCKED.some(([base, bits]) => inV4(address, base, bits));
  if (kind !== 6) return false;
  const g = expandV6(address);
  if (!g) return false;
  // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d) and NAT64 (64:ff9b::/96) carry an IPv4 address.
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return isPublicAddress(v4FromGroups(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPublicAddress(v4FromGroups(g[6], g[7]));
  if (g[0] === 0x2002) return isPublicAddress(v4FromGroups(g[1], g[2])); // 6to4
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (g[0] === 0x2001 && g[1] === 0) return false; // Teredo
  return g[0] >= 0x2000 && g[0] <= 0x3fff; // global unicast only
}

// Resolve, check every address, and hand the socket only an address we checked.
const pinned = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      dnsLookup(hostname, { all: true }, (error, addresses) => {
        if (error) return callback(error, "", 4);
        const list = addresses as { address: string; family: number }[];
        if (list.length === 0 || !list.every((a) => isPublicAddress(a.address))) return callback(new Error("Private addresses are not allowed"), "", 4);
        if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
        callback(null, list[0].address, list[0].family);
      });
    },
  },
});

export async function fetchPublicImage(start: string): Promise<Buffer> {
  let url = new URL(start);
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== "https:") throw new Error("Only https image URLs are accepted");
    if (url.port && url.port !== "443") throw new Error("Only the standard https port is allowed");
    const literal = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(literal) && !isPublicAddress(literal)) throw new Error("Private addresses are not allowed");

    const res = await undiciFetch(url, { redirect: "manual", dispatcher: pinned, signal: AbortSignal.timeout(10_000) });
    const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (next) {
      await res.body?.cancel();
      url = new URL(next, url);
      continue;
    }
    if (!res.ok) throw new Error(`Could not fetch image (${res.status})`);
    if (!res.headers.get("content-type")?.startsWith("image/")) throw new Error("URL is not an image");
    if (Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) throw new Error("Image is larger than 12 MB");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of res.body ?? []) {
      size += chunk.byteLength;
      if (size > MAX_IMAGE_BYTES) {
        await res.body?.cancel();
        throw new Error("Image is larger than 12 MB");
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  throw new Error("Too many redirects");
}
