/**
 * Shared types for the Auto Graph Color plugin.
 */

/** A note's indexed metadata. `path` is vault-relative (e.g. "concepts/foo.md"). */
export interface IndexedNote {
	path: string;
	basename: string;
	folder: string;
	frontmatterType?: string; // YAML `type` (concept | entity | source | ...)
	frontmatterKind?: string; // YAML `kind` (tool | person | ...)
	tags: string[]; // both YAML and inline, lowercased, leading # stripped
	snippet: string; // first ~300 chars after frontmatter, for AI context
	links: string[]; // resolved outbound wikilinks (paths of target notes)
}

/** A cluster of notes produced by Louvain + (optionally) refined/named by Claude. */
export interface Cluster {
	id: number;
	name: string; // human-readable label (LLM-named, or fallback)
	members: string[]; // note paths
	/** Query for graph.json colorGroups. Falls back to file:"a" OR file:"b" if no clean pattern. */
	query: string;
	/** Short rationale for why these notes belong together (LLM-provided, optional). */
	rationale?: string;
}

/** A named, ordered palette of hex colors. */
export interface Palette {
	id: string;
	name: string;
	mood: "vivid" | "pastel" | "muted" | "warm" | "cool" | "earth" | "neon";
	colors: string[]; // hex strings, e.g. "#ff7a59"
}

/** A single variation the user can flip through and apply. */
export interface Variation {
	id: string;
	clusteringId: string; // groups variations sharing the same clustering
	clusters: Cluster[];
	palette: Palette;
	/** Final colorGroups payload, ready to write to graph.json. */
	colorGroups: GraphColorGroup[];
}

/** Obsidian's graph.json colorGroup entry. */
export interface GraphColorGroup {
	query: string;
	color: { a: number; rgb: number };
}

export interface FavoriteVariation extends Variation {
	favoritedAt: number; // ms epoch
	label?: string;
}

export interface PluginData {
	settings: PluginSettings;
	favorites: FavoriteVariation[];
	lastClustering?: { id: string; clusters: Cluster[]; createdAt: number };
}

export interface PluginSettings {
	anthropicApiKey: string;
	model: string;
	clusterCountTarget: number; // soft target for Louvain resolution
	useClaudeForNaming: boolean;
	variationsPerBatch: number;
	/**
	 * Folders whose contents should be excluded from indexing. Default
	 * excludes `raw/` because in the LLM-wiki pattern that's ingested source
	 * material the user doesn't curate — coloring it doesn't reflect the
	 * shape of the curated wiki.
	 * Match is path-prefix based (vault-relative, no leading slash).
	 */
	excludeFolders: string[];

	/** Surface diagnostic commands ("Debug: ...") in the command palette. Off by default. */
	showDebugCommands: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	anthropicApiKey: "",
	model: "claude-sonnet-4-5-20250929",
	clusterCountTarget: 10,
	useClaudeForNaming: true,
	variationsPerBatch: 5,
	excludeFolders: ["raw/"],
	showDebugCommands: false,
};
