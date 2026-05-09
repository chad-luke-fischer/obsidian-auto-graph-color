import { App, Notice } from "obsidian";

/**
 * Deep-introspect an open graph view and dump every plausibly-relevant field
 * to console. We use this to find where node visuals actually live in the
 * current Obsidian build, since the graph view has no public API.
 */
export function debugDumpGraphInternals(app: App): void {
	const leaves = app.workspace.getLeavesOfType("graph");
	if (leaves.length === 0) {
		new Notice("Open the graph view first, then run this command.");
		return;
	}

	const view = leaves[0].view as unknown as Record<string, unknown>;
	console.log("=== AUTO GRAPH COLOR :: GRAPH VIEW DUMP ===");
	console.log("[1] view top-level keys:", Object.keys(view ?? {}));
	console.log("[1.1] view constructor:", view?.constructor?.constructor?.name);

	// Probe known + plausible engine paths
	for (const path of ["dataEngine", "engine", "graphView", "view"]) {
		const obj = view?.[path];
		if (obj && typeof obj === "object") {
			console.log(`[2] view.${path} keys:`, Object.keys(obj));
			const opts = (obj as Record<string, unknown>).options;
			if (opts && typeof opts === "object") {
				console.log(`[2.1] view.${path}.options keys:`, Object.keys(opts));
			}
		}
	}

	// Probe the renderer
	const renderer = view?.renderer as Record<string, unknown> | undefined;
	if (!renderer) {
		console.log("[3] no view.renderer found — bail");
		new Notice("Dumped view keys to console. No renderer found.");
		return;
	}
	console.log("[3] view.renderer keys:", Object.keys(renderer));

	// Look for size-like scalar fields on the renderer (these often control
	// global node/link size mults).
	const numericKeys: { key: string; value: number }[] = [];
	for (const [k, v] of Object.entries(renderer)) {
		if (typeof v === "number") numericKeys.push({ key: k, value: v });
	}
	console.log(
		"[3.1] renderer numeric fields:",
		numericKeys.map((n) => `${n.key}=${n.value}`).join(", "),
	);

	// Look for node arrays
	const possibleNodeArrays = ["nodes", "displayedNodes", "nodeList", "graph"]
		.map((k) => ({ k, v: renderer[k] }))
		.filter((x) => Array.isArray(x.v));
	console.log(
		"[4] renderer arrays found:",
		possibleNodeArrays.map((p) => `${p.k}[${(p.v as unknown[]).length}]`).join(", "),
	);

	// Inspect the first node we find
	const nodesField = possibleNodeArrays[0];
	if (nodesField && Array.isArray(nodesField.v) && nodesField.v.length > 0) {
		const node = nodesField.v[0] as Record<string, unknown>;
		console.log(`[5] first ${nodesField.k}[0] keys:`, Object.keys(node));
		const nodeNumericKeys: string[] = [];
		for (const [k, v] of Object.entries(node)) {
			if (typeof v === "number") nodeNumericKeys.push(`${k}=${v}`);
		}
		console.log("[5.1] node numeric fields:", nodeNumericKeys.join(", "));

		// Likely visual containers
		for (const sub of ["circle", "graphics", "displayObject", "container", "sprite"]) {
			const obj = node[sub];
			if (obj && typeof obj === "object") {
				console.log(`[5.2] node.${sub} keys:`, Object.keys(obj));
				const scale = (obj as Record<string, unknown>).scale;
				if (scale) {
					console.log(`[5.3] node.${sub}.scale:`, scale);
				}
			}
		}
	}

	// Probe core graph plugin instance
	const ip = (app as unknown as {
		internalPlugins?: { plugins?: Record<string, { instance?: unknown }> };
	}).internalPlugins;
	const instance = ip?.plugins?.graph?.instance as Record<string, unknown> | undefined;
	if (instance) {
		console.log("[6] core graph instance keys:", Object.keys(instance));
		const opts = instance.options as Record<string, unknown> | undefined;
		if (opts) console.log("[6.1] core graph instance.options keys:", Object.keys(opts));
	}

	new Notice(
		"Auto Graph Color: dumped graph internals to console (Ctrl+Shift+I).",
		6000,
	);
}
