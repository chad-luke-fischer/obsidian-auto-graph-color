import { Notice, Plugin } from "obsidian";
import {
	Cluster,
	DEFAULT_SETTINGS,
	FavoriteVariation,
	IndexedNote,
	PluginData,
} from "./src/types";
import { indexVault } from "./src/indexer";
import { clusterByLinks } from "./src/clustering";
import { refineClustersWithClaude } from "./src/claude";
import { PaletteModal } from "./src/modals/PaletteModal";
import { FavoritesModal } from "./src/modals/FavoritesModal";
import { AutoGraphColorSettingTab } from "./src/settings";
import { debugTestApply } from "./src/graphConfig";
import { debugDumpGraphInternals } from "./src/debugGraph";

export default class AutoGraphColorPlugin extends Plugin {
	data: PluginData = {
		settings: { ...DEFAULT_SETTINGS },
		favorites: [],
	};

	async onload(): Promise<void> {
		await this.loadPluginData();

		this.addSettingTab(new AutoGraphColorSettingTab(this.app, this));

		this.addCommand({
			id: "generate",
			name: "Generate color palettes",
			callback: () => void this.generate(),
		});

		this.addCommand({
			id: "favorites",
			name: "Browse favorites",
			callback: () => {
				new FavoritesModal(this.app, {
					getFavorites: () => this.data.favorites,
					deleteFavorite: async (id) => this.deleteFavorite(id),
				}).open();
			},
		});

		this.addCommand({
			id: "regenerate-from-cache",
			name: "Reroll palettes (use last clustering)",
			callback: () => void this.openModalFromCache(),
		});

		if (this.data.settings.showDebugCommands) {
			this.addCommand({
				id: "debug-test-apply",
				name: "Debug: test apply (writes one red colorGroup for path:concepts)",
				callback: () => void debugTestApply(this.app),
			});

			this.addCommand({
				id: "debug-dump-graph-internals",
				name: "Debug: dump graph view internals",
				callback: () => debugDumpGraphInternals(this.app),
			});
		}

		this.addRibbonIcon("palette", "Auto Graph Color", () => void this.generate());

		// On startup, after layout settles, kick off an index → cluster pass
		// so opening the modal is instant. Don't surface UI; just warm the cache.
		this.app.workspace.onLayoutReady(() => {
			void this.warmCache();
		});
	}

	// ---- core flow -----------------------------------------------------------

	private async warmCache(): Promise<void> {
		try {
			const clusters = await this.runPipeline({ silent: true });
			this.data.lastClustering = {
				id: `cl-${Date.now()}`,
				clusters,
				createdAt: Date.now(),
			};
			await this.savePluginData();
		} catch (e) {
			console.warn("[auto-graph-color] warmCache failed", e);
		}
	}

	private async generate(): Promise<void> {
		const notice = new Notice("Auto Graph Color: indexing vault…", 0);
		try {
			const clusters = await this.runPipeline({ silent: false });
			notice.hide();
			const id = `cl-${Date.now()}`;
			this.data.lastClustering = { id, clusters, createdAt: Date.now() };
			await this.savePluginData();
			this.openModal(id, clusters);
		} catch (e) {
			notice.hide();
			console.error("[auto-graph-color] generate failed", e);
			new Notice("Auto Graph Color: failed — see console.");
		}
	}

	private async openModalFromCache(): Promise<void> {
		if (!this.data.lastClustering) {
			new Notice("No cached clustering — run Generate first.");
			return;
		}
		this.openModal(
			this.data.lastClustering.id,
			this.data.lastClustering.clusters,
		);
	}

	private openModal(clusteringId: string, clusters: Cluster[]): void {
		new PaletteModal(this.app, clusteringId, clusters, {
			saveFavorite: (v) => this.saveFavorite(v),
			rerunClustering: async () => {
				const next = await this.runPipeline({ silent: false });
				this.data.lastClustering = {
					id: `cl-${Date.now()}`,
					clusters: next,
					createdAt: Date.now(),
				};
				await this.savePluginData();
				return next;
			},
		}).open();
	}

	/** Index → Louvain → (Claude refine) pipeline. */
	private async runPipeline({
		silent,
	}: {
		silent: boolean;
	}): Promise<Cluster[]> {
		const notes: IndexedNote[] = await indexVault(
			this.app,
			this.data.settings.excludeFolders ?? [],
		);
		if (!silent)
			console.log(
				`[auto-graph-color] indexed ${notes.length} notes (excluded folders: ${(this.data.settings.excludeFolders ?? []).join(", ") || "none"})`,
			);

		let clusters = clusterByLinks(notes, this.data.settings.clusterCountTarget);
		if (!silent) console.log(`[auto-graph-color] ${clusters.length} clusters`);

		if (
			this.data.settings.useClaudeForNaming &&
			this.data.settings.anthropicApiKey
		) {
			if (!silent) new Notice("Auto Graph Color: naming with Claude…");
			clusters = await refineClustersWithClaude(
				clusters,
				notes,
				this.data.settings.anthropicApiKey,
				this.data.settings.model,
			);
		}

		return clusters;
	}

	// ---- favorites -----------------------------------------------------------

	private async saveFavorite(v: FavoriteVariation): Promise<void> {
		// Dedupe by id; cap to 50.
		this.data.favorites = [
			v,
			...this.data.favorites.filter((f) => f.id !== v.id),
		].slice(0, 50);
		await this.savePluginData();
	}

	private async deleteFavorite(id: string): Promise<void> {
		this.data.favorites = this.data.favorites.filter((f) => f.id !== id);
		await this.savePluginData();
	}

	// ---- persistence ---------------------------------------------------------

	private async loadPluginData(): Promise<void> {
		const raw = (await this.loadData()) as Partial<PluginData> | null;
		const loadedSettings = (raw?.settings ?? {}) as Record<string, unknown>;

		// Migration: drop deprecated breathing fields from pre-removal builds.
		const hadBreathing =
			"breathingEnabled" in loadedSettings ||
			"breathingIntensity" in loadedSettings ||
			"breathingPeriodSec" in loadedSettings;
		delete loadedSettings.breathingEnabled;
		delete loadedSettings.breathingIntensity;
		delete loadedSettings.breathingPeriodSec;

		this.data = {
			settings: { ...DEFAULT_SETTINGS, ...loadedSettings },
			favorites: raw?.favorites ?? [],
			lastClustering: raw?.lastClustering,
		};

		if (hadBreathing) await this.savePluginData();
	}

	async savePluginData(): Promise<void> {
		await this.saveData(this.data);
	}
}
