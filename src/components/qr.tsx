import QRCode from "qrcode";

export async function Qr({ url, size = 120, label }: { url: string; size?: number; label?: string }) {
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#17142b", light: "#ffffff" } });
  return (
    <div className="inline-flex flex-col items-center gap-1">
      <div className="rounded-lg bg-white p-1" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} aria-label={label ?? `QR code for ${url}`} role="img" />
    </div>
  );
}
