export interface PaletteColor {
  id: number;
  role: string;
  foreground: `#${string}`;
  background: `#${string}`;
  recommendedContrastRatio: number;
}

export const WCAG_AA_NORMAL_TEXT_RATIO = 4.5;

export const PALETTE = [
  {
    id: 1,
    role: "standard",
    foreground: "#1a1a1a",
    background: "#ffffff",
    recommendedContrastRatio: 19.45,
  },
  {
    id: 2,
    role: "emphasis-1",
    foreground: "#b00020",
    background: "#ffe5e9",
    recommendedContrastRatio: 6.05,
  },
  {
    id: 3,
    role: "emphasis-2",
    foreground: "#1b5e20",
    background: "#e6f4ea",
    recommendedContrastRatio: 7.92,
  },
  {
    id: 4,
    role: "emphasis-3",
    foreground: "#0d47a1",
    background: "#e3f0fb",
    recommendedContrastRatio: 8.85,
  },
  {
    id: 5,
    role: "emphasis-4",
    foreground: "#4a148c",
    background: "#f1e4f5",
    recommendedContrastRatio: 10.05,
  },
  {
    id: 6,
    role: "emphasis-5",
    foreground: "#8d3700",
    background: "#fff3e0",
    recommendedContrastRatio: 7.83,
  },
  {
    id: 7,
    role: "emphasis-6",
    foreground: "#006064",
    background: "#e0f2f1",
    recommendedContrastRatio: 6.5,
  },
  {
    id: 8,
    role: "caution",
    foreground: "#5d4037",
    background: "#efebe9",
    recommendedContrastRatio: 7.4,
  },
  {
    id: 9,
    role: "muted-1",
    foreground: "#424242",
    background: "#fafafa",
    recommendedContrastRatio: 10.1,
  },
  {
    id: 10,
    role: "muted-2",
    foreground: "#616161",
    background: "#f5f5f5",
    recommendedContrastRatio: 6.51,
  },
  {
    id: 11,
    role: "link",
    foreground: "#1565c0",
    background: "#ffffff",
    recommendedContrastRatio: 6.16,
  },
  {
    id: 12,
    role: "warning",
    foreground: "#b71c1c",
    background: "#fff7f8",
    recommendedContrastRatio: 7.41,
  },
  {
    id: 13,
    role: "success",
    foreground: "#2e7d32",
    background: "#f0fdf2",
    recommendedContrastRatio: 5.65,
  },
  {
    id: 14,
    role: "info",
    foreground: "#0277bd",
    background: "#f0f9ff",
    recommendedContrastRatio: 5.31,
  },
  {
    id: 15,
    role: "quote",
    foreground: "#37474f",
    background: "#eceff1",
    recommendedContrastRatio: 8.42,
  },
  {
    id: 16,
    role: "strike",
    foreground: "#424242",
    background: "#ffffff",
    recommendedContrastRatio: 10.36,
  },
] as const satisfies readonly PaletteColor[];

export type PaletteHex =
  | (typeof PALETTE)[number]["foreground"]
  | (typeof PALETTE)[number]["background"];

export function isPaletteHex(value: string): value is PaletteHex {
  return PALETTE.some(
    (color) =>
      color.foreground.toLowerCase() === value.toLowerCase() ||
      color.background.toLowerCase() === value.toLowerCase(),
  );
}

function relativeLuminance(hex: string): number {
  const normalized = hex.replace("#", "");
  const channels = [0, 2, 4].map(
    (offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255,
  );
  const [red, green, blue] = channels.map((channel) => {
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

export function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function isAllowedPaletteCombination(foreground: string, background: string): boolean {
  return (
    isPaletteHex(foreground) &&
    isPaletteHex(background) &&
    contrastRatio(foreground, background) >= WCAG_AA_NORMAL_TEXT_RATIO
  );
}

export function allowedPaletteCombinations() {
  const foregrounds = PALETTE.map((color) => color.foreground);
  const backgrounds = PALETTE.map((color) => color.background);
  return foregrounds.flatMap((foreground) =>
    backgrounds
      .filter((background) => isAllowedPaletteCombination(foreground, background))
      .map((background) => ({
        foreground,
        background,
        contrastRatio: contrastRatio(foreground, background),
      })),
  );
}

export function cssStyleAttrForPalette(foreground: string, background: string): string {
  if (!isAllowedPaletteCombination(foreground, background)) {
    throw new Error("A11Y-002 insufficient contrast ratio");
  }

  return `color: ${foreground}; background-color: ${background};`;
}
