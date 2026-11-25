/**
 * B.1 — Visuels par défaut 100 % Pâtisserie Algérienne (SVG hors-ligne)
 * et compression photo caméra côté navigateur.
 */

export const PRODUCT_PHOTOS_KEY_PREFIX = "patisgest.product_photos.v1.";

type VisualPreset = {
  keywords: string[];
  bg: string;
  accent: string;
  badge: string;
  glyph: "baklawa" | "makrout" | "croissant" | "millefeuille" | "eclair" | "tarte" | "cake" | "kalb";
};

const PRESETS: VisualPreset[] = [
  { keywords: ["baklawa", "baklava"], bg: "#fef3c7", accent: "#b45309", badge: "Amandes & Miel", glyph: "baklawa" },
  { keywords: ["makrout", "makroudh"], bg: "#ffedd5", accent: "#c2410c", badge: "Tradition DZ", glyph: "makrout" },
  { keywords: ["kalb", "qalb", "louz", "cham"], bg: "#fde68a", accent: "#92400e", badge: "Sirop fleur", glyph: "kalb" },
  { keywords: ["griwech", "tcharek", "zlabia", "samsa", "mchewek"], bg: "#fef9c3", accent: "#a16207", badge: "Orientale", glyph: "baklawa" },
  { keywords: ["baguette", "pain complet", "pain maison", "pain", "khobz"], bg: "#fef3c7", accent: "#b45309", badge: "Boulangerie", glyph: "croissant" },
  { keywords: ["croissant", "pain au chocolat", "brioche"], bg: "#ffedd5", accent: "#9a3412", badge: "Viennoiserie", glyph: "croissant" },
  { keywords: ["mille-feuille", "millefeuille"], bg: "#fae8ff", accent: "#7e22ce", badge: "Feuilletage", glyph: "millefeuille" },
  { keywords: ["éclair", "eclair", "paris-brest"], bg: "#ede9fe", accent: "#5b21b6", badge: "Choux", glyph: "eclair" },
  { keywords: ["tarte", "tartelette", "citron", "fraise"], bg: "#ffe4e6", accent: "#be123c", badge: "Tarterie", glyph: "tarte" },
  { keywords: ["gâteau", "gateau", "layer", "anniversaire", "entremets", "cake", "mariage", "bento", "cupcake"], bg: "#f3e8ff", accent: "#6d28d9", badge: "Cake Shop", glyph: "cake" },
];

function buildSvgDataUri(preset: VisualPreset, label: string): string {
  const safeLabel = label.replace(/[<>&"']/g, "").slice(0, 22);
  let shape = "";
  switch (preset.glyph) {
    case "baklawa":
      shape = `<polygon points="120,30 190,75 120,120 50,75" fill="${preset.accent}" opacity="0.88"/><polygon points="120,42 172,75 120,108 68,75" fill="#fff7ed" opacity="0.45"/><circle cx="120" cy="75" r="10" fill="#78350f"/>`;
      break;
    case "makrout":
      shape = `<polygon points="120,32 182,75 120,118 58,75" fill="${preset.accent}" opacity="0.9"/><line x1="88" y1="53" x2="152" y2="97" stroke="#fff7ed" stroke-width="3"/><line x1="152" y1="53" x2="88" y2="97" stroke="#fff7ed" stroke-width="3"/>`;
      break;
    case "croissant":
      shape = `<path d="M55,95 C70,45 170,45 185,95 C155,78 85,78 55,95 Z" fill="${preset.accent}" opacity="0.9"/><path d="M90,62 L98,84 M120,56 L120,82 M150,62 L142,84" stroke="#fff7ed" stroke-width="3" stroke-linecap="round"/>`;
      break;
    case "millefeuille":
      shape = `<rect x="60" y="42" width="120" height="16" rx="4" fill="${preset.accent}"/><rect x="64" y="60" width="112" height="14" rx="3" fill="#fff" opacity="0.85"/><rect x="60" y="76" width="120" height="16" rx="4" fill="${preset.accent}" opacity="0.85"/><rect x="64" y="94" width="112" height="14" rx="3" fill="#fff" opacity="0.85"/>`;
      break;
    case "eclair":
      shape = `<rect x="52" y="54" width="136" height="40" rx="20" fill="${preset.accent}"/><path d="M68,66 Q95,56 120,66 T172,66" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.85"/>`;
      break;
    case "tarte":
      shape = `<path d="M56,74 Q120,114 184,74 L172,104 Q120,120 68,104 Z" fill="${preset.accent}"/><circle cx="96" cy="64" r="11" fill="#fb7185"/><circle cx="120" cy="58" r="12" fill="#f43f5e"/><circle cx="144" cy="64" r="11" fill="#fb7185"/>`;
      break;
    case "kalb":
      shape = `<rect x="62" y="46" width="116" height="62" rx="10" fill="${preset.accent}" opacity="0.9"/><circle cx="120" cy="77" r="9" fill="#fef3c7"/>`;
      break;
    case "cake":
    default:
      shape = `<rect x="68" y="66" width="104" height="44" rx="8" fill="${preset.accent}" opacity="0.9"/><rect x="84" y="42" width="72" height="26" rx="6" fill="${preset.accent}" opacity="0.72"/><line x1="120" y1="24" x2="120" y2="42" stroke="#78350f" stroke-width="3"/><circle cx="120" cy="22" r="5" fill="#f59e0b"/>`;
      break;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 150"><rect width="240" height="150" rx="16" fill="${preset.bg}"/>${shape}<text x="120" y="138" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="${preset.accent}">${safeLabel}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function defaultPastryVisual(productName: string): string {
  const norm = productName.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const matched =
    PRESETS.find((p) => p.keywords.some((kw) => norm.includes(kw.normalize("NFD").replace(/\p{Diacritic}/gu, "")))) ??
    PRESETS[PRESETS.length - 1];
  return buildSvgDataUri(matched, productName || matched.badge);
}

export function readProductPhotosMap(scopeKey: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`${PRODUCT_PHOTOS_KEY_PREFIX}${scopeKey}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveProductPhotoLocal(scopeKey: string, articleId: string, dataUrl: string | null) {
  if (typeof window === "undefined") return;
  try {
    const current = readProductPhotosMap(scopeKey);
    if (dataUrl) current[articleId] = dataUrl;
    else delete current[articleId];
    window.localStorage.setItem(`${PRODUCT_PHOTOS_KEY_PREFIX}${scopeKey}`, JSON.stringify(current));
    window.dispatchEvent(new Event("patisgest-product-photos"));
  } catch {
    /* ignore storage quota */
  }
}

export async function compressImageFileToDataUrl(file: File, maxSize = 480, quality = 0.78): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Lecture du fichier photo impossible."));
    reader.readAsDataURL(file);
  });

  if (typeof document === "undefined") return dataUrl;

  return new Promise<string>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const ratio = Math.min(1, maxSize / Math.max(img.width, img.height, 1));
      const w = Math.max(1, Math.round(img.width * ratio));
      const h = Math.max(1, Math.round(img.height * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Format image non supporté."));
    img.src = dataUrl;
  });
}
