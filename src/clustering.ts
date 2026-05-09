import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import { Cluster, IndexedNote } from "./types";

/**
 * Cluster the vault using Louvain community detection on the wikilink graph,
 * with folder fallback for orphan/disconnected components.
 *
 * `resolution` > 1.0 produces more, smaller clusters; < 1.0 produces fewer,
 * larger clusters. We tune to roughly hit `targetCount`.
 */
export function clusterByLinks(
	notes: IndexedNote[],
	targetCount: number,
): Cluster[] {
	const graph = new Graph({ type: "undirected", multi: false });

	for (const n of notes) graph.addNode(n.path);
	for (const n of notes) {
		for (const dst of n.links) {
			if (!graph.hasNode(dst)) continue; // link to non-md or external
			if (n.path === dst) continue;
			if (!graph.hasEdge(n.path, dst)) graph.addEdge(n.path, dst);
		}
	}

	// Run Louvain, then merge tiny clusters and split monster clusters by folder.
	const resolution = pickResolution(graph.order, targetCount);
	const communities = louvain(graph, { resolution }) as Record<string, number>;

	// Group note paths by community id.
	const groups = new Map<number, string[]>();
	for (const [path, comm] of Object.entries(communities)) {
		const list = groups.get(comm) ?? [];
		list.push(path);
		groups.set(comm, list);
	}

	// Folder fallback for isolated notes (no edges → Louvain assigns each its own community).
	// We re-bucket all isolated nodes into "by-folder" pseudo-clusters.
	const isolatedByFolder = new Map<string, string[]>();
	const finalGroups: string[][] = [];
	for (const list of groups.values()) {
		if (list.length === 1) {
			const p = list[0];
			if (graph.degree(p) === 0) {
				const folder = topFolder(p) || "(root)";
				const arr = isolatedByFolder.get(folder) ?? [];
				arr.push(p);
				isolatedByFolder.set(folder, arr);
				continue;
			}
		}
		finalGroups.push(list);
	}
	for (const [, members] of isolatedByFolder) finalGroups.push(members);

	// Sort by size descending so the biggest clusters get color slots first.
	finalGroups.sort((a, b) => b.length - a.length);

	return finalGroups.map((members, i) => {
		const noteLookup = new Map(notes.map((n) => [n.path, n]));
		const memberNotes = members.map((p) => noteLookup.get(p)!).filter(Boolean);
		const { name, query } = inferLabelAndQuery(i, memberNotes);
		return { id: i, name, query, members };
	});
}

/** Heuristic mapping from graph order + target → Louvain resolution. */
function pickResolution(nodeCount: number, target: number): number {
	if (nodeCount <= 0 || target <= 0) return 1.0;
	// Empirical: each +1.0 to resolution roughly +5-10 clusters on a typical vault.
	// Start at 1.0 and bias toward target.
	const expectedDefault = Math.max(4, Math.round(Math.sqrt(nodeCount)));
	if (target <= expectedDefault) return 1.0;
	const ratio = target / expectedDefault;
	return Math.min(3.5, Math.max(0.4, ratio));
}

function topFolder(path: string): string {
	const i = path.indexOf("/");
	return i === -1 ? "" : path.slice(0, i);
}

function commonPrefix(strs: string[]): string {
	if (strs.length === 0) return "";
	let prefix = strs[0];
	for (const s of strs) {
		while (s.indexOf(prefix) !== 0) {
			prefix = prefix.slice(0, -1);
			if (prefix === "") return "";
		}
	}
	// Trim back to last "/" so we don't end mid-name.
	const lastSlash = prefix.lastIndexOf("/");
	return lastSlash === -1 ? "" : prefix.slice(0, lastSlash + 1);
}

/**
 * Pick a default name + query for a cluster.
 * Preference order:
 *   1. All members share a folder prefix → `path:"prefix"` query, name = folder
 *   2. All members share a frontmatter type → `["type":x]` query
 *   3. Fallback → file:"a" OR file:"b" OR ... (truncated; rename-fragile)
 */
function inferLabelAndQuery(
	idx: number,
	notes: IndexedNote[],
): { name: string; query: string } {
	if (notes.length === 0) return { name: `Cluster ${idx + 1}`, query: "" };

	// 1. Common folder prefix
	const prefix = commonPrefix(notes.map((n) => n.path));
	if (prefix && prefix.length > 1) {
		const trimmed = prefix.replace(/\/$/, "");
		return {
			name: trimmed || `Cluster ${idx + 1}`,
			query: `path:"${trimmed}"`,
		};
	}

	// 2. Shared frontmatter type
	const types = new Set(notes.map((n) => n.frontmatterType).filter(Boolean));
	if (types.size === 1) {
		const t = [...types][0]!;
		return { name: `${t}s`, query: `["type":"${t}"]` };
	}

	// 3. Fallback: enumerate filenames, capped at 50 to keep query short
	const sample = notes.slice(0, 50);
	const query = sample.map((n) => `file:"${n.basename}"`).join(" OR ");
	return { name: `Cluster ${idx + 1}`, query };
}
