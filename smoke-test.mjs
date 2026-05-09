// Smoke test for the pure-logic pieces. Run: node smoke-test.mjs
// Validates: Louvain on a synthetic vault graph, palette color packing,
// colorGroup payload shape.
//
// We can't import the .ts files directly, so this re-implements just enough
// to exercise the same dependency surface (graphology + louvain) and
// the hex→rgb math.

import Graph from "graphology";
import louvain from "graphology-communities-louvain";

// --- Fake vault: 3 obvious communities ---
const notes = [
	// "concepts" cluster - all interlinked
	{ path: "concepts/a.md", links: ["concepts/b.md", "concepts/c.md"] },
	{ path: "concepts/b.md", links: ["concepts/a.md", "concepts/c.md"] },
	{ path: "concepts/c.md", links: ["concepts/a.md", "concepts/b.md"] },
	// "entities" cluster
	{ path: "entities/x.md", links: ["entities/y.md", "entities/z.md"] },
	{ path: "entities/y.md", links: ["entities/x.md"] },
	{ path: "entities/z.md", links: ["entities/x.md"] },
	// orphan that links nowhere
	{ path: "orphan.md", links: [] },
];

const graph = new Graph({ type: "undirected", multi: false });
for (const n of notes) graph.addNode(n.path);
for (const n of notes) {
	for (const dst of n.links) {
		if (graph.hasNode(dst) && !graph.hasEdge(n.path, dst)) {
			graph.addEdge(n.path, dst);
		}
	}
}

const communities = louvain(graph, { resolution: 1.0 });
console.log("Communities:", communities);

const groupSizes = {};
for (const c of Object.values(communities)) {
	groupSizes[c] = (groupSizes[c] ?? 0) + 1;
}
console.log("Group sizes:", groupSizes);

// We expect at least 2 communities (concepts vs entities).
const distinct = new Set(Object.values(communities)).size;
if (distinct < 2) {
	console.error("FAIL: expected ≥2 communities, got", distinct);
	process.exit(1);
}
console.log(`✓ Louvain produced ${distinct} communities on synthetic vault`);

// --- Palette packing check ---
function hexToObsidianRgb(hex) {
	const m = hex.replace("#", "");
	const r = parseInt(m.slice(0, 2), 16);
	const g = parseInt(m.slice(2, 4), 16);
	const b = parseInt(m.slice(4, 6), 16);
	return (r << 16) | (g << 8) | b;
}

const cases = [
	["#000000", 0],
	["#ffffff", 0xffffff],
	["#ff7a59", (0xff << 16) | (0x7a << 8) | 0x59],
	["#C95B20", (0xc9 << 16) | (0x5b << 8) | 0x20],
];
for (const [hex, expected] of cases) {
	const got = hexToObsidianRgb(hex);
	if (got !== expected) {
		console.error(`FAIL: hexToObsidianRgb(${hex}) = ${got}, expected ${expected}`);
		process.exit(1);
	}
}
console.log("✓ hexToObsidianRgb packs all cases correctly");

// --- colorGroup shape check ---
const colorGroup = {
	query: 'path:"concepts"',
	color: { a: 1, rgb: hexToObsidianRgb("#f38ba8") },
};
const json = JSON.stringify(colorGroup);
if (!json.includes('"a":1') || !json.includes('"rgb":')) {
	console.error("FAIL: colorGroup shape wrong:", json);
	process.exit(1);
}
console.log(`✓ colorGroup shape: ${json}`);

console.log("\nAll smoke tests passed.");
