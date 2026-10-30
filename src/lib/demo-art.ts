// Illustrated stand-ins for crochet photos, used by the demo seed and the evaluation set until
// real photographs replace them. Each design has a fixed construction (the "pattern") and
// variable yarn colour, pose, background and framing (what differs between two makers).

export type Variation = { hue: number; angle: number; bg: string; scale: number; dx: number; dy: number };

const BGS = ["#f4efe6", "#e6eef4", "#eef4e6", "#f4e6ee", "#ffffff", "#e9e4f2", "#d9d4cc", "#f2ead8"];

export function variation(seed: number): Variation {
  const rand = mulberry(seed);
  return {
    hue: Math.floor(rand() * 360),
    angle: Math.round((rand() - 0.5) * 36),
    bg: BGS[Math.floor(rand() * BGS.length)],
    scale: 1.08 + rand() * 0.3,
    dx: Math.round((rand() - 0.5) * 50),
    dy: Math.round((rand() - 0.5) * 40),
  };
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const yarn = (hue: number, l = 72, s = 55) => `hsl(${hue} ${s}% ${l}%)`;

// Rows of small arcs read as crochet stitches.
function stitches(id: string, color: string) {
  return `<pattern id="${id}" width="10" height="9" patternUnits="userSpaceOnUse">
    <rect width="10" height="9" fill="${color}"/>
    <path d="M0 7 Q2.5 1 5 7 Q7.5 1 10 7" fill="none" stroke="rgba(0,0,0,.16)" stroke-width="1.4"/>
  </pattern>`;
}

type Design = (v: Variation) => string;

const bunny = (astronaut: boolean): Design => (v) => {
  const body = yarn(v.hue);
  return `
    <defs>${stitches("s1", body)}${stitches("s2", "hsl(0 0% 92%)")}</defs>
    <ellipse cx="0" cy="70" rx="70" ry="80" fill="url(#s1)"/>
    <ellipse cx="-34" cy="-120" rx="16" ry="62" fill="url(#s1)" transform="rotate(-12 -34 -120)"/>
    <ellipse cx="34" cy="-120" rx="16" ry="62" fill="url(#s1)" transform="rotate(12 34 -120)"/>
    <ellipse cx="-34" cy="-118" rx="7" ry="44" fill="hsl(350 60% 82%)" transform="rotate(-12 -34 -118)"/>
    <ellipse cx="34" cy="-118" rx="7" ry="44" fill="hsl(350 60% 82%)" transform="rotate(12 34 -118)"/>
    <circle cx="0" cy="-30" r="58" fill="url(#s1)"/>
    <circle cx="-20" cy="-36" r="6" fill="#1d1a22"/><circle cx="20" cy="-36" r="6" fill="#1d1a22"/>
    <path d="M-7 -16 Q0 -10 7 -16" stroke="#1d1a22" stroke-width="3" fill="none"/>
    <g transform="translate(0 72)">
      <circle cx="-9" cy="-6" r="9" fill="hsl(130 45% 45%)"/><circle cx="9" cy="-6" r="9" fill="hsl(130 45% 45%)"/>
      <circle cx="0" cy="7" r="9" fill="hsl(130 45% 45%)"/><rect x="-1.5" y="12" width="3" height="16" fill="hsl(130 45% 35%)"/>
    </g>
    <ellipse cx="-58" cy="122" rx="26" ry="16" fill="url(#s1)"/><ellipse cx="58" cy="122" rx="26" ry="16" fill="url(#s1)"/>
    ${
      astronaut
        ? `<circle cx="0" cy="-34" r="80" fill="rgba(190,225,255,.28)" stroke="url(#s2)" stroke-width="16"/>
           <rect x="-62" y="8" width="124" height="22" rx="8" fill="url(#s2)"/>
           <rect x="56" y="20" width="44" height="80" rx="10" fill="url(#s2)"/>
           <circle cx="78" cy="44" r="7" fill="hsl(5 75% 55%)"/><circle cx="78" cy="68" r="7" fill="hsl(210 75% 55%)"/>
           <rect x="-16" y="96" width="32" height="10" rx="3" fill="hsl(210 70% 50%)"/>`
        : ""
    }`;
};

const octopus: Design = (v) => {
  const body = yarn(v.hue, 66, 60);
  const legs = Array.from({ length: 8 }, (_, i) => {
    const x = -98 + i * 28;
    return `<path d="M${x} 40 q${i % 2 ? 18 : -18} 60 ${i % 2 ? -6 : 6} 110" stroke="url(#s1)" stroke-width="22" stroke-linecap="round" fill="none"/>`;
  }).join("");
  return `
    <defs>${stitches("s1", body)}</defs>
    ${legs}
    <ellipse cx="0" cy="-10" rx="100" ry="88" fill="url(#s1)"/>
    <path d="M-70 -78 L0 -190 L70 -78 Z" fill="#f7f7f7"/>
    <path d="M-48 -112 L48 -112 L58 -95 L-58 -95 Z" fill="hsl(4 75% 55%)"/>
    <path d="M-24 -150 L24 -150 L32 -134 L-32 -134 Z" fill="hsl(4 75% 55%)"/>
    <circle cx="0" cy="-196" r="14" fill="hsl(48 95% 60%)"/>
    <circle cx="-30" cy="-6" r="9" fill="#1d1a22"/><circle cx="30" cy="-6" r="9" fill="#1d1a22"/>
    <path d="M-12 22 Q0 32 12 22" stroke="#1d1a22" stroke-width="3" fill="none"/>`;
};

const whale: Design = (v) => {
  const body = yarn(v.hue, 62, 50);
  return `
    <defs>${stitches("s1", body)}${stitches("s2", "hsl(0 0% 94%)")}</defs>
    <path d="M120 10 q60 -70 70 -40 q-20 10 -30 40 q40 -10 60 20 q-40 10 -70 0 Z" fill="url(#s1)"/>
    <ellipse cx="-10" cy="20" rx="140" ry="92" fill="url(#s1)"/>
    <ellipse cx="-20" cy="72" rx="110" ry="40" fill="url(#s2)"/>
    <path d="M-60 -70 Q-10 -150 60 -72 Z" fill="hsl(225 55% 35%)"/>
    <circle cx="66" cy="-128" r="13" fill="#f7f7f7"/>
    <path d="M-80 -6 q12 10 24 0" stroke="#1d1a22" stroke-width="4" fill="none"/>
    <path d="M-110 30 Q-90 44 -70 30" stroke="#1d1a22" stroke-width="3" fill="none"/>
    <ellipse cx="10" cy="56" rx="26" ry="12" fill="url(#s1)" transform="rotate(20 10 56)"/>`;
};

const frog: Design = (v) => {
  const body = yarn((v.hue % 80) + 80, 58, 50);
  return `
    <defs>${stitches("s1", body)}</defs>
    <ellipse cx="0" cy="60" rx="96" ry="78" fill="url(#s1)"/>
    <circle cx="-48" cy="-52" r="34" fill="url(#s1)"/><circle cx="48" cy="-52" r="34" fill="url(#s1)"/>
    <ellipse cx="0" cy="-10" rx="88" ry="58" fill="url(#s1)"/>
    <circle cx="-48" cy="-56" r="18" fill="#fff"/><circle cx="48" cy="-56" r="18" fill="#fff"/>
    <circle cx="-46" cy="-54" r="9" fill="#1d1a22"/><circle cx="46" cy="-54" r="9" fill="#1d1a22"/>
    <path d="M-40 10 Q0 40 40 10" stroke="#1d1a22" stroke-width="4" fill="none"/>
    <path d="M-20 -86 C-80 -150 40 -190 70 -120 C40 -110 0 -100 -20 -86 Z" fill="hsl(105 50% 35%)"/>
    <path d="M-10 -92 C10 -120 40 -140 62 -124" stroke="hsl(105 50% 22%)" stroke-width="3" fill="none"/>
    <ellipse cx="-70" cy="128" rx="34" ry="14" fill="url(#s1)"/><ellipse cx="70" cy="128" rx="34" ry="14" fill="url(#s1)"/>`;
};

const grannySquare: Design = (v) => {
  const rounds = [0, 1, 2, 3, 4].map((r) => yarn((v.hue + r * 70) % 360, 60 + (r % 2) * 10, 55));
  return `
    <defs>${rounds.map((c, i) => stitches(`g${i}`, c)).join("")}</defs>
    ${rounds
      .map((_, i) => {
        const size = 220 - i * 44;
        return `<rect x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" rx="8" fill="url(#g${i})"/>`;
      })
      .join("")}`;
};

const beanie: Design = (v) => {
  const c = yarn(v.hue, 55, 45);
  return `
    <defs>${stitches("s1", c)}</defs>
    <path d="M-130 60 Q-130 -150 0 -150 Q130 -150 130 60 Z" fill="url(#s1)"/>
    <rect x="-140" y="40" width="280" height="60" rx="14" fill="${yarn(v.hue, 45, 45)}"/>
    ${Array.from({ length: 14 }, (_, i) => `<rect x="${-132 + i * 19.5}" y="44" width="8" height="52" fill="rgba(0,0,0,.12)"/>`).join("")}`;
};

const cat: Design = (v) => {
  const c = yarn(v.hue, 70, 35);
  return `
    <defs>${stitches("s1", c)}</defs>
    <ellipse cx="0" cy="70" rx="78" ry="74" fill="url(#s1)"/>
    <path d="M-60 -60 L-50 -130 L-10 -80 Z M60 -60 L50 -130 L10 -80 Z" fill="url(#s1)"/>
    <circle cx="0" cy="-30" r="66" fill="url(#s1)"/>
    <circle cx="-22" cy="-36" r="7" fill="#1d1a22"/><circle cx="22" cy="-36" r="7" fill="#1d1a22"/>
    <path d="M-40 -12 L-80 -18 M-40 -4 L-80 4 M40 -12 L80 -18 M40 -4 L80 4" stroke="#1d1a22" stroke-width="2"/>
    <path d="M70 110 q60 -10 50 -80" stroke="url(#s1)" stroke-width="20" stroke-linecap="round" fill="none"/>`;
};

export const DESIGNS = {
  "clover-bunny": bunny(false),
  "astronaut-bunny": bunny(true),
  "lighthouse-octopus": octopus,
  "sleepy-whale": whale,
  "fern-frog": frog,
  "granny-square": grannySquare,
  "plain-beanie": beanie,
  "tabby-cat": cat,
} satisfies Record<string, Design>;

export type DesignKey = keyof typeof DESIGNS;

export function renderSvg(design: DesignKey, v: Variation, size = 640) {
  const inner = DESIGNS[design](v);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-320 -320 640 640">
    <rect x="-320" y="-320" width="640" height="640" fill="${v.bg}"/>
    <ellipse cx="0" cy="250" rx="220" ry="26" fill="rgba(0,0,0,.08)"/>
    <g transform="translate(${v.dx} ${v.dy}) rotate(${v.angle}) scale(${v.scale})">${inner}</g>
  </svg>`;
}

export async function renderJpeg(design: DesignKey, seed: number) {
  const { default: sharp } = await import("sharp");
  return sharp(Buffer.from(renderSvg(design, variation(seed)))).jpeg({ quality: 88 }).toBuffer();
}
