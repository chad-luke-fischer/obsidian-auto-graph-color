import { App, Notice, WorkspaceLeaf } from "obsidian";
import { Cluster, GraphColorGroup, Palette, Variation } from "./types";
import { hexToObsidianRgb } from "./palettes";

const GRAPH_JSON_PATH = ".obsidian/graph.json";

/** Read graph.json (returns {} if missing or unparseable). */
export async function readGraphConfig(app: App): Promise<Record<string, unknown>> {
	try {
		const exists = await app.vault.adapter.exists(GRAPH_JSON_PATH);
		if (!exists) return {};
		const raw = await app.vault.adapter.read(GRAPH_JSON_PATH);
		return JSON.parse(raw);
	} catch (e) {
		console.warn("[auto-graph-color] readGraphConfig failed", e);
		return {};
	}
}

/** Write graph.json, preserving any keys we don't manage (physics, search, etc.). */
export async function writeColorGroups(
	app: App,
	colorGroups: GraphColorGroup[],
): Promise<void> {
	const current = await readGraphConfig(app);
	const next = { ...current, colorGroups };
	await app.vault.adapter.write(GRAPH_JSON_PATH, JSON.stringify(next, null, 2));
}

/** Build colorGroups for a (clusters × palette) pair. */
export function buildColorGroups(
	clusters: Cluster[],
	palette: Palette,
): GraphColorGroup[] {
	return clusters
		.filter((c) => c.query && c.query.trim().length > 0)
		.map((c, i) => {
			const hex = palette.colors[i % palette.colors.length];
			return {
				query: c.query,
				color: { a: 1, rgb: hexToObsidianRgb(hex) },
			};
		});
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The core graph plugin's instance, where colorGroups actually live in memory.
 *
 * Per-view renderer options are derivative — closing/reopening a graph leaf
 * does NOT reset the core plugin's options, so a debounced save after our
 * disk write will clobber graph.json with whatever the core plugin still has
 * in memory. The reliable fix is to mutate the core plugin's options object
 * and call its own saveOptions(), which writes graph.json AND keeps the
 * in-memory state consistent.
 *
 * This uses undocumented internals — `internalPlugins.plugins.graph.instance`
 * — but it's the same path the Sync Graph Settings community plugin uses,
 * and it's stable across Obsidian 1.x.
 */
function getCoreGraphInstance(app: App): {
	options?: { colorGroups?: GraphColorGroup[] } & Record<string, unknown>;
	saveOptions?: () => unknown;
} | null {
	const ip = (app as unknown as {
		internalPlugins?: {
			plugins?: Record<string, { instance?: unknown }>;
			getPluginById?: (id: string) => { instance?: unknown } | undefined;
		};
	}).internalPlugins;
	if (!ip) return null;
	const plug =
		ip.plugins?.graph ??
		ip.getPluginById?.("graph") ??
		undefined;
	const instance = plug?.instance;
	if (!instance) return null;
	return instance as ReturnType<typeof getCoreGraphInstance>;
}

/**
 * Apply a Variation: write colorGroups to graph.json and reload any open graph
 * view so it picks up the new colors.
 *
 * Ordering:
 *
 *   1. Snapshot which leaves currently host a graph view.
 *   2. Detach each (setViewState→empty). Obsidian flushes the leaf's in-memory
 *      graph options to disk on detach — letting that flush land first means
 *      our subsequent write isn't clobbered.
 *   3. Wait a beat for the flush to settle.
 *   4. Mutate instance.options.colorGroups and call instance.saveOptions() so
 *      both the in-memory source-of-truth and graph.json hold our colors.
 *   5. Reattach each leaf (setViewState→graph). Fresh views read the updated
 *      options and render with the new colors.
 *
 * We deliberately do NOT call dataEngine.onOptionsChange() — it's a heavy
 * "any option changed" handler that re-runs filter/group evaluation and, when
 * fired in quick succession (e.g. user clicks Apply twice), can leave the
 * engine in a broken state.
 */
export async function applyVariation(
	app: App,
	v: Variation,
): Promise<void> {
	const groupsCopy = JSON.parse(JSON.stringify(v.colorGroups));

	const leaves = app.workspace.getLeavesOfType("graph");

	for (const leaf of leaves) {
		await leaf.setViewState({ type: "empty" });
	}
	await sleep(40);

	const instance = getCoreGraphInstance(app);
	if (instance?.options) {
		instance.options.colorGroups = groupsCopy;
		if (instance.saveOptions) {
			try {
				instance.saveOptions();
			} catch (e) {
				console.warn(
					"[auto-graph-color] saveOptions threw, falling back to file write",
					e,
				);
				await writeColorGroups(app, v.colorGroups);
			}
		} else {
			await writeColorGroups(app, v.colorGroups);
		}
	} else {
		console.warn(
			"[auto-graph-color] could not access internalPlugins.plugins.graph.instance — falling back to direct file write",
		);
		await writeColorGroups(app, v.colorGroups);
	}

	for (const leaf of leaves) {
		await leaf.setViewState({ type: "graph" });
	}

	console.log(
		`[auto-graph-color] applied ${v.colorGroups.length} colorGroups (${leaves.length} leaves) for "${v.palette.name}"`,
	);
	if (leaves.length === 0) {
		new Notice(
			`Auto Graph Color: applied "${v.palette.name}". Open the graph view to see colors.`,
		);
	} else {
		new Notice(`Auto Graph Color: applied "${v.palette.name}".`);
	}
}

/**
 * Diagnostic: write a single hardcoded test colorGroup, dump everything to
 * console, and report status to the user. Use this to isolate whether the
 * problem is (a) writing graph.json, (b) Obsidian's reading of our queries,
 * or (c) something else.
 */
export async function debugTestApply(app: App): Promise<void> {
	const before = await readGraphConfig(app);
	console.log("[auto-graph-color][debug] BEFORE graph.json", JSON.parse(JSON.stringify(before)));

	// Dump core graph plugin instance keys so we can see which path holds options
	const ip = (app as unknown as { internalPlugins?: Record<string, unknown> })
		.internalPlugins;
	console.log(
		"[auto-graph-color][debug] internalPlugins keys:",
		ip ? Object.keys(ip as object) : null,
	);
	const instance = getCoreGraphInstance(app);
	console.log(
		"[auto-graph-color][debug] core graph instance keys:",
		instance ? Object.keys(instance as object) : null,
	);
	if (instance?.options) {
		console.log(
			"[auto-graph-color][debug] core graph instance.options keys:",
			Object.keys(instance.options),
		);
		console.log(
			"[auto-graph-color][debug] core graph instance.options.colorGroups:",
			JSON.parse(JSON.stringify(instance.options.colorGroups ?? [])),
		);
	}

	const testGroup: GraphColorGroup = {
		query: 'path:"concepts"',
		color: { a: 1, rgb: hexToObsidianRgb("#ff0066") },
	};

	// Use the same path applyVariation uses — through the core plugin instance.
	if (instance?.options) {
		instance.options.colorGroups = [testGroup];
		try {
			instance.saveOptions?.();
			console.log("[auto-graph-color][debug] called instance.saveOptions()");
		} catch (e) {
			console.warn("[auto-graph-color][debug] saveOptions threw", e);
			await writeColorGroups(app, [testGroup]);
		}
	} else {
		await writeColorGroups(app, [testGroup]);
	}
	await sleep(80);

	const afterWrite = await readGraphConfig(app);
	console.log("[auto-graph-color][debug] AFTER WRITE graph.json", JSON.parse(JSON.stringify(afterWrite)));
	const wroteOk =
		JSON.stringify(afterWrite.colorGroups ?? []) === JSON.stringify([testGroup]);

	// Inspect view internals for any open graph leaves
	const leaves = app.workspace.getLeavesOfType("graph");
	console.log(`[auto-graph-color][debug] open graph leaves: ${leaves.length}`);
	for (const leaf of leaves) {
		const view = leaf.view as unknown as Record<string, unknown>;
		console.log(
			"[auto-graph-color][debug] leaf.view top-level keys:",
			Object.keys(view ?? {}),
		);
		const ok = liveUpdateGraphView(leaf, [testGroup]);
		console.log("[auto-graph-color][debug] liveUpdate result:", ok);
	}

	// Wait, then read once more — sometimes Obsidian flushes after a delay
	await sleep(500);
	const finalState = await readGraphConfig(app);
	console.log("[auto-graph-color][debug] FINAL graph.json", JSON.parse(JSON.stringify(finalState)));
	const finalOk =
		JSON.stringify(finalState.colorGroups ?? []) === JSON.stringify([testGroup]);

	new Notice(
		`AGC debug — write ok: ${wroteOk}, leaves: ${leaves.length}, final ok: ${finalOk}. See console.`,
		8000,
	);
}

/**
 * Try to mutate an open graph view's in-memory color groups so the user sees
 * the new colors instantly, without closing/reopening the leaf.
 *
 * This walks several known internal paths because Obsidian's graph view doesn't
 * expose a public API for color groups. If none of them match (future Obsidian
 * versions shift things around), we return false and the caller falls back to
 * the file-based reload.
 */
function liveUpdateGraphView(
	leaf: WorkspaceLeaf,
	colorGroups: GraphColorGroup[],
): boolean {
	// `view` is typed as `View`, but the graph view exposes engine/renderer
	// internals we have to access dynamically.
	const view = leaf.view as unknown as {
		dataEngine?: GraphEngineLike;
		engine?: GraphEngineLike;
		renderer?: GraphRendererLike;
	};

	const engine: GraphEngineLike | undefined = view?.dataEngine ?? view?.engine;
	const renderer: GraphRendererLike | undefined = view?.renderer;

	let mutated = false;

	if (engine?.options && Array.isArray(engine.options.colorGroups)) {
		engine.options.colorGroups = colorGroups;
		mutated = true;
	}
	// Some Obsidian builds keep options on the renderer instead.
	if (renderer && Array.isArray((renderer as { colorGroupOptions?: unknown }).colorGroupOptions)) {
		(renderer as { colorGroupOptions: GraphColorGroup[] }).colorGroupOptions = colorGroups;
		mutated = true;
	}
	if (!mutated) return false;

	// Trigger a redraw via whichever method exists.
	try {
		if (typeof engine?.render === "function") engine.render();
		else if (typeof engine?.requestRender === "function") engine.requestRender();
		if (renderer) {
			(renderer as { changed?: boolean }).changed = true;
			if (typeof renderer.draw === "function") renderer.draw();
		}
		return true;
	} catch (e) {
		console.warn("[auto-graph-color] live update redraw failed", e);
		return false;
	}
}

interface GraphEngineLike {
	options?: { colorGroups?: GraphColorGroup[] } & Record<string, unknown>;
	render?: () => void;
	requestRender?: () => void;
}

interface GraphRendererLike {
	draw?: () => void;
}
