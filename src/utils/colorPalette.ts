export type ChartTheme =
    | "indigo" | "azure" | "emerald" | "violet"
    | "amber" | "rose" | "slate" | "dark" | "custom";

const THEME_PALETTES: Record<Exclude<ChartTheme, "custom">, string[]> = {
    indigo: ["#4f46e5", "#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe", "#e0e7ff"],
    azure: ["#0284c7", "#0ea5e9", "#38bdf8", "#7dd3fc", "#bae6fd", "#e0f2fe"],
    emerald: ["#059669", "#10b981", "#34d399", "#6ee7b7", "#a7f3d0", "#d1fae5"],
    violet: ["#7c3aed", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe"],
    amber: ["#d97706", "#f59e0b", "#fbbf24", "#fcd34d", "#fde68a", "#fef3c7"],
    rose: ["#e11d48", "#f43f5e", "#fb7185", "#fda4af", "#fecdd3", "#ffe4e6"],
    slate: ["#334155", "#475569", "#64748b", "#94a3b8", "#cbd5e1", "#e2e8f0"],
    dark: ["#111827", "#1f2937", "#374151", "#4b5563", "#6b7280", "#9ca3af"]
};

/**
 * Returns a color array long enough for `count` slices, cycling the base
 * palette if there are more slices than base colors.
 */
export function getPalette(
    theme: ChartTheme,
    count: number,
    startColor?: string,
    endColor?: string
): string[] {
    if (theme === "custom" && startColor && endColor) {
        return interpolateColors(startColor, endColor, count);
    }

    const base = THEME_PALETTES[theme as Exclude<ChartTheme, "custom">] ?? THEME_PALETTES.indigo;
    const colors: string[] = [];
    for (let i = 0; i < count; i++) {
        colors.push(base[i % base.length]);
    }
    return colors;
}

function interpolateColors(start: string, end: string, count: number): string[] {
    const s = hexToRgb(start);
    const e = hexToRgb(end);
    if (!s || !e || count <= 1) {
        return [start];
    }

    const colors: string[] = [];
    for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const r = Math.round(s.r + (e.r - s.r) * t);
        const g = Math.round(s.g + (e.g - s.g) * t);
        const b = Math.round(s.b + (e.b - s.b) * t);
        colors.push(rgbToHex(r, g, b));
    }
    return colors;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
    if (!match) {
        return null;
    }
    return {
        r: parseInt(match[1], 16),
        g: parseInt(match[2], 16),
        b: parseInt(match[3], 16)
    };
}

function rgbToHex(r: number, g: number, b: number): string {
    return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}
/** Lightens a hex color by a percentage (0-1) */
export function lighten(hex: string, amount: number): string {
    const { r, g, b } = hexToRgbSafe(hex);
    const nr = Math.round(r + (255 - r) * amount);
    const ng = Math.round(g + (255 - g) * amount);
    const nb = Math.round(b + (255 - b) * amount);
    return rgbToHexSafe(nr, ng, nb);
}

/** Darkens a hex color by a percentage (0-1) */
export function darken(hex: string, amount: number): string {
    const { r, g, b } = hexToRgbSafe(hex);
    const nr = Math.round(r * (1 - amount));
    const ng = Math.round(g * (1 - amount));
    const nb = Math.round(b * (1 - amount));
    return rgbToHexSafe(nr, ng, nb);
}

function hexToRgbSafe(hex: string): { r: number; g: number; b: number } {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
    if (!match) {
        return { r: 99, g: 102, b: 241 };
    }
    return {
        r: parseInt(match[1], 16),
        g: parseInt(match[2], 16),
        b: parseInt(match[3], 16)
    };
}

function rgbToHexSafe(r: number, g: number, b: number): string {
    const clamp = (v: number): number => Math.max(0, Math.min(255, v));
    return "#" + [clamp(r), clamp(g), clamp(b)].map(v => v.toString(16).padStart(2, "0")).join("");
}

/** Converts a hex color to an rgba() string at the given alpha (0-1). */
export function toRgba(hex: string, alpha: number): string {
    const { r, g, b } = hexToRgbSafe(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}