import { Palette } from "./types";

/**
 * Curated palette library — each is hand-picked for graph-view legibility
 * (good saturation against Obsidian's dark theme, distinct hues at small sizes).
 * Order within each palette is the order colors get assigned to clusters.
 */
export const PALETTES: Palette[] = [
	{
		id: "catppuccin-mocha",
		name: "Catppuccin Mocha",
		mood: "muted",
		colors: [
			"#f38ba8", "#fab387", "#f9e2af", "#a6e3a1",
			"#94e2d5", "#89b4fa", "#cba6f7", "#f5c2e7",
			"#eba0ac", "#74c7ec", "#b4befe", "#89dceb",
		],
	},
	{
		id: "tailwind-vivid",
		name: "Tailwind Vivid",
		mood: "vivid",
		colors: [
			"#ef4444", "#f97316", "#eab308", "#22c55e",
			"#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
			"#14b8a6", "#f59e0b", "#a855f7", "#10b981",
		],
	},
	{
		id: "viridis",
		name: "Viridis",
		mood: "cool",
		colors: [
			"#440154", "#482878", "#3e4a89", "#31688e",
			"#26828e", "#1f9e89", "#35b779", "#6ece58",
			"#b5de2b", "#fde725", "#7e03a8", "#cc4778",
		],
	},
	{
		id: "sunset",
		name: "Sunset",
		mood: "warm",
		colors: [
			"#ff6b6b", "#ffa372", "#ffd166", "#ef476f",
			"#f78c6b", "#ff9f1c", "#e63946", "#f4a261",
			"#e76f51", "#cb997e", "#ddbea9", "#a98467",
		],
	},
	{
		id: "ocean-pastel",
		name: "Ocean Pastel",
		mood: "pastel",
		colors: [
			"#a8dadc", "#cdb4db", "#ffc8dd", "#bde0fe",
			"#a2d2ff", "#b5ead7", "#c7ceea", "#ffdac1",
			"#ff9aa2", "#e2f0cb", "#9ad1d4", "#cdeac0",
		],
	},
	{
		id: "terracotta",
		name: "Terracotta",
		mood: "earth",
		colors: [
			"#9c6644", "#b08968", "#7f5539", "#ddb892",
			"#e6ccb2", "#a47148", "#bc8a5f", "#774936",
			"#603808", "#7f4f24", "#936639", "#a98467",
		],
	},
	{
		id: "neon-cyber",
		name: "Neon Cyber",
		mood: "neon",
		colors: [
			"#ff00ff", "#00ffff", "#ff10f0", "#39ff14",
			"#fffb00", "#ff6ec7", "#00ff9f", "#ff5e5b",
			"#bc13fe", "#0aefff", "#fe53bb", "#f5d300",
		],
	},
	{
		id: "nord",
		name: "Nord",
		mood: "cool",
		colors: [
			"#bf616a", "#d08770", "#ebcb8b", "#a3be8c",
			"#88c0d0", "#81a1c1", "#5e81ac", "#b48ead",
			"#8fbcbb", "#4c566a", "#d8dee9", "#e5e9f0",
		],
	},
	{
		id: "spring-meadow",
		name: "Spring Meadow",
		mood: "vivid",
		colors: [
			"#06d6a0", "#118ab2", "#073b4c", "#ffd166",
			"#ef476f", "#83c5be", "#edf6f9", "#ffddd2",
			"#e29578", "#006d77", "#83e377", "#b9e769",
		],
	},
	{
		id: "rosewood",
		name: "Rosewood",
		mood: "muted",
		colors: [
			"#65463e", "#a44a3f", "#d4a276", "#cdc7be",
			"#9b7a6c", "#5e3c58", "#b56576", "#e56b6f",
			"#eaac8b", "#6d597a", "#355070", "#915f6d",
		],
	},
];

/** Pick `n` palettes, optionally avoiding ones in `excludeIds`. Random unless `seed` provided. */
export function samplePalettes(
	n: number,
	excludeIds: Set<string> = new Set(),
): Palette[] {
	const pool = PALETTES.filter((p) => !excludeIds.has(p.id));
	const shuffled = [...pool].sort(() => Math.random() - 0.5);
	return shuffled.slice(0, Math.min(n, shuffled.length));
}

/** "#ff7a59" → 16742489 (decimal RGB int as Obsidian expects). */
export function hexToObsidianRgb(hex: string): number {
	const m = hex.replace("#", "");
	const r = parseInt(m.slice(0, 2), 16);
	const g = parseInt(m.slice(2, 4), 16);
	const b = parseInt(m.slice(4, 6), 16);
	return (r << 16) | (g << 8) | b;
}

/** Inverse of hexToObsidianRgb — used for previews. */
export function rgbToHex(rgb: number): string {
	return "#" + rgb.toString(16).padStart(6, "0");
}
