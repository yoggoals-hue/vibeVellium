// Character color utilities — generates a stable, distinct color from a character id/name.
// Used for the 3px left border on chat messages so multi-character RP is readable.

const CHARACTER_COLORS = [
  { name: "rose",     hex: "#e11d48" },
  { name: "amber",    hex: "#d97706" },
  { name: "emerald",  hex: "#059669" },
  { name: "sky",      hex: "#0284c7" },
  { name: "violet",   hex: "#7c3aed" },
  { name: "fuchsia",  hex: "#c026d3" },
  { name: "teal",     hex: "#0d9488" },
  { name: "orange",   hex: "#ea580c" },
  { name: "lime",     hex: "#65a30d" },
  { name: "indigo",   hex: "#4f46e5" },
  { name: "pink",     hex: "#db2777" },
  { name: "cyan",     hex: "#0891b2" }
];

const MANUAL_OVERRIDES_KEY = "vibe-vellium:character-color-overrides";

function loadManualOverrides(): Record<string, string> {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(MANUAL_OVERRIDES_KEY) : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function saveManualOverrides(map: Record<string, string>): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(MANUAL_OVERRIDES_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Returns the color hex for a given character id (or name as fallback).
 * Stable: same id always returns same color. Overridable via setCharacterColor.
 */
export function getCharacterColor(characterId: string, fallbackName?: string): string {
  const key = characterId || fallbackName || "unknown";
  const overrides = loadManualOverrides();
  if (overrides[key]) return overrides[key];

  const hash = hashString(key);
  return CHARACTER_COLORS[hash % CHARACTER_COLORS.length].hex;
}

/**
 * Returns a list of all available color presets (for the manual override picker in settings).
 */
export function listCharacterColorPresets(): Array<{ name: string; hex: string }> {
  return CHARACTER_COLORS;
}

/**
 * Set a manual color override for a character. Pass null to clear.
 */
export function setCharacterColorOverride(characterId: string, colorHex: string | null): void {
  const overrides = loadManualOverrides();
  if (colorHex === null) {
    delete overrides[characterId];
  } else {
    overrides[characterId] = colorHex;
  }
  saveManualOverrides(overrides);
}

/**
 * Returns true if a character has a manual color override set.
 */
export function hasCharacterColorOverride(characterId: string): boolean {
  return Boolean(loadManualOverrides()[characterId]);
}

/**
 * Convert hex color to rgba string with given alpha (0..1). Useful for subtle backgrounds.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const trimmed = hex.replace("#", "");
  const r = parseInt(trimmed.slice(0, 2), 16);
  const g = parseInt(trimmed.slice(2, 4), 16);
  const b = parseInt(trimmed.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
