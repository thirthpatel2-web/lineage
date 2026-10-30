import { DESIGNS, renderJpeg, type DesignKey } from "@/lib/demo-art";

export const runtime = "nodejs";

// Demo illustrations used for sample outside listings and the "try a sample photo" buttons.
export async function GET(_req: Request, { params }: { params: Promise<{ design: string; seed: string }> }) {
  const { design, seed } = await params;
  if (!(design in DESIGNS) || !/^\d{1,6}$/.test(seed)) return new Response("Not found", { status: 404 });
  const jpeg = await renderJpeg(design as DesignKey, Number(seed));
  return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" } });
}
