import { requestUrl } from "obsidian";
import { Cluster, IndexedNote } from "./types";

/**
 * Call the Anthropic Messages API to refine + name a clustering.
 *
 * We DO NOT send full file contents — we send a compact summary per cluster
 * (folder distribution, top tags, sample basenames + 1-line snippets).
 *
 * Claude returns: per-cluster name, optional rationale, and an optional
 * suggested query that beats our heuristic (e.g. spotting a tag-based
 * grouping we missed).
 *
 * If the call fails or `apiKey` is empty, we return the input clusters
 * unchanged — the heuristic names from `clustering.ts` are good enough to ship.
 */
export async function refineClustersWithClaude(
	clusters: Cluster[],
	notes: IndexedNote[],
	apiKey: string,
	model: string,
): Promise<Cluster[]> {
	if (!apiKey) return clusters;

	const noteLookup = new Map(notes.map((n) => [n.path, n]));
	const summaries = clusters.map((c) => clusterSummary(c, noteLookup));

	const userMessage = [
		"You are helping label clusters of notes from an Obsidian vault for graph-view coloring.",
		"For each cluster below, return a short human-readable NAME (1-3 words, Title Case) and a one-line RATIONALE.",
		"If the heuristic QUERY looks wrong (e.g. you see all members share a tag we missed), suggest a better Obsidian search query.",
		"Otherwise leave query as null.",
		"",
		"Respond with ONLY a JSON array, one object per cluster, in the same order:",
		`[{ "id": 0, "name": "...", "rationale": "...", "query": null | "..." }, ...]`,
		"",
		"Clusters:",
		JSON.stringify(summaries, null, 2),
	].join("\n");

	let body: string;
	try {
		const res = await requestUrl({
			url: "https://api.anthropic.com/v1/messages",
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model,
				max_tokens: 4096,
				messages: [{ role: "user", content: userMessage }],
			}),
			throw: false,
		});
		if (res.status >= 400) {
			console.warn("[auto-graph-color] Claude API error", res.status, res.text);
			return clusters;
		}
		const json = res.json as {
			content?: Array<{ type: string; text?: string }>;
		};
		body = json.content?.find((c) => c.type === "text")?.text ?? "";
	} catch (e) {
		console.warn("[auto-graph-color] Claude call failed", e);
		return clusters;
	}

	const parsed = extractJsonArray(body);
	if (!parsed) {
		console.warn("[auto-graph-color] Could not parse Claude response", body);
		return clusters;
	}

	// Apply refinements by id; keep original cluster if Claude omitted it.
	const byId = new Map<number, ClaudeRefinement>();
	for (const r of parsed) {
		if (typeof r.id === "number") byId.set(r.id, r);
	}

	return clusters.map((c) => {
		const r = byId.get(c.id);
		if (!r) return c;
		return {
			...c,
			name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : c.name,
			rationale: typeof r.rationale === "string" ? r.rationale : c.rationale,
			query: typeof r.query === "string" && r.query.trim() ? r.query.trim() : c.query,
		};
	});
}

interface ClaudeRefinement {
	id: number;
	name?: string;
	rationale?: string;
	query?: string | null;
}

/** Best-effort JSON extraction from a model response (handles ```json fences). */
function extractJsonArray(text: string): ClaudeRefinement[] | null {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	const candidate = (fenced ? fenced[1] : text).trim();
	const start = candidate.indexOf("[");
	const end = candidate.lastIndexOf("]");
	if (start === -1 || end === -1 || end <= start) return null;
	try {
		return JSON.parse(candidate.slice(start, end + 1));
	} catch {
		return null;
	}
}

function clusterSummary(
	cluster: Cluster,
	notes: Map<string, IndexedNote>,
): {
	id: number;
	heuristic_name: string;
	heuristic_query: string;
	size: number;
	folders: Record<string, number>;
	top_tags: string[];
	sample: { name: string; folder: string; type?: string; snippet: string }[];
} {
	const memberNotes = cluster.members
		.map((p) => notes.get(p))
		.filter((n): n is IndexedNote => Boolean(n));

	const folders: Record<string, number> = {};
	const tagCounts = new Map<string, number>();
	for (const n of memberNotes) {
		const top = n.folder.split("/")[0] || "(root)";
		folders[top] = (folders[top] ?? 0) + 1;
		for (const t of n.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
	}
	const top_tags = [...tagCounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 8)
		.map(([t]) => t);

	// Sample 6 representative notes (prefer ones with snippets).
	const sample = memberNotes
		.slice(0, 30)
		.sort((a, b) => b.snippet.length - a.snippet.length)
		.slice(0, 6)
		.map((n) => ({
			name: n.basename,
			folder: n.folder,
			type: n.frontmatterType,
			snippet: n.snippet.slice(0, 140),
		}));

	return {
		id: cluster.id,
		heuristic_name: cluster.name,
		heuristic_query: cluster.query,
		size: memberNotes.length,
		folders,
		top_tags,
		sample,
	};
}
