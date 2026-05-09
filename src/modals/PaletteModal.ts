import { App, Modal, Notice, Setting } from "obsidian";
import { Cluster, FavoriteVariation, Palette, Variation } from "../types";
import { PALETTES, samplePalettes } from "../palettes";
import { applyVariation } from "../graphConfig";
import { buildColorGroups } from "../graphConfig";

type ModalCallbacks = {
	saveFavorite: (v: FavoriteVariation) => Promise<void>;
	rerunClustering: () => Promise<Cluster[]>;
};

/**
 * The flip-through modal. Shows a row of palette thumbnails along the top,
 * and the focused palette's per-cluster swatches + names below.
 *
 * Buttons:
 *   ◀ ▶                navigate
 *   Apply              writes graph.json + reloads graph
 *   ❤ Favorite         saves into plugin data
 *   🎲 Reroll palettes draws fresh palettes for the same clustering
 *   ↻  Re-analyze      reruns the index → cluster pipeline
 */
export class PaletteModal extends Modal {
	private clusters: Cluster[];
	private clusteringId: string;
	private variations: Variation[] = [];
	private current = 0;
	private callbacks: ModalCallbacks;

	constructor(
		app: App,
		clusteringId: string,
		clusters: Cluster[],
		callbacks: ModalCallbacks,
	) {
		super(app);
		this.clusteringId = clusteringId;
		this.clusters = clusters;
		this.callbacks = callbacks;
		this.regeneratePalettes();
	}

	onOpen(): void {
		this.modalEl.addClass("agc-modal");
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private regeneratePalettes(): void {
		const used = new Set(this.variations.map((v) => v.palette.id));
		const fresh = samplePalettes(5, used);
		const pool = fresh.length === 5 ? fresh : samplePalettes(5);
		this.variations = pool.map((palette, i) => this.makeVariation(palette, i));
		this.current = 0;
	}

	private makeVariation(palette: Palette, idx: number): Variation {
		return {
			id: `${this.clusteringId}-${palette.id}-${Date.now()}-${idx}`,
			clusteringId: this.clusteringId,
			clusters: this.clusters,
			palette,
			colorGroups: buildColorGroups(this.clusters, palette),
		};
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Auto Graph Color" });
		contentEl.createEl("p", {
			text: `${this.clusters.length} clusters detected. Flip through palettes, apply the one you like, or favorite it for later.`,
			cls: "agc-subtitle",
		});

		// Palette strip across the top
		const strip = contentEl.createDiv({ cls: "agc-strip" });
		this.variations.forEach((v, i) => {
			const cell = strip.createDiv({
				cls: "agc-strip-cell" + (i === this.current ? " is-current" : ""),
			});
			cell.createDiv({ cls: "agc-strip-label", text: v.palette.name });
			const swatches = cell.createDiv({ cls: "agc-strip-swatches" });
			v.palette.colors.slice(0, 6).forEach((c) => {
				const s = swatches.createDiv({ cls: "agc-swatch-mini" });
				s.style.backgroundColor = c;
			});
			cell.addEventListener("click", () => {
				this.current = i;
				this.render();
			});
		});

		// Detail panel
		const v = this.variations[this.current];
		if (!v) {
			contentEl.createEl("p", { text: "No palettes available." });
			return;
		}

		const detail = contentEl.createDiv({ cls: "agc-detail" });
		detail.createEl("h3", { text: v.palette.name });
		detail.createEl("div", {
			cls: "agc-mood",
			text: `mood: ${v.palette.mood}`,
		});

		const grid = detail.createDiv({ cls: "agc-cluster-grid" });
		v.clusters.forEach((c, i) => {
			const card = grid.createDiv({ cls: "agc-cluster-card" });
			const dot = card.createDiv({ cls: "agc-dot" });
			dot.style.backgroundColor =
				v.palette.colors[i % v.palette.colors.length];
			const txt = card.createDiv({ cls: "agc-cluster-text" });
			txt.createEl("div", { cls: "agc-cluster-name", text: c.name });
			txt.createEl("div", {
				cls: "agc-cluster-meta",
				text: `${c.members.length} notes`,
			});
			if (c.rationale) {
				txt.createEl("div", {
					cls: "agc-cluster-rationale",
					text: c.rationale,
				});
			}
		});

		// Action row
		const actions = contentEl.createDiv({ cls: "agc-actions" });

		new Setting(actions)
			.addButton((b) =>
				b.setButtonText("◀").onClick(() => {
					this.current = (this.current - 1 + this.variations.length) % this.variations.length;
					this.render();
				}),
			)
			.addButton((b) =>
				b.setButtonText("▶").onClick(() => {
					this.current = (this.current + 1) % this.variations.length;
					this.render();
				}),
			)
			.addButton((b) =>
				b
					.setButtonText("Apply")
					.setCta()
					.onClick(async () => {
						try {
							await applyVariation(this.app, v);
						} catch (e) {
							console.error("[auto-graph-color] apply failed", e);
							new Notice("Auto Graph Color: apply failed — see console.");
						}
					}),
			)
			.addButton((b) =>
				b.setButtonText("♥ Favorite").onClick(async () => {
					const fav: FavoriteVariation = {
						...v,
						favoritedAt: Date.now(),
						label: v.palette.name,
					};
					await this.callbacks.saveFavorite(fav);
					new Notice(`Saved "${v.palette.name}" to favorites.`);
				}),
			)
			.addButton((b) =>
				b.setButtonText("🎲 Reroll").onClick(() => {
					this.regeneratePalettes();
					this.render();
				}),
			)
			.addButton((b) =>
				b.setButtonText("↻ Re-analyze").onClick(async () => {
					new Notice("Re-analyzing vault…");
					this.clusters = await this.callbacks.rerunClustering();
					this.clusteringId = `cl-${Date.now()}`;
					this.variations = [];
					this.regeneratePalettes();
					this.render();
				}),
			);

		const footer = contentEl.createDiv({ cls: "agc-footer" });
		footer.createEl("span", {
			text: `${this.current + 1} / ${this.variations.length}`,
			cls: "agc-pager",
		});
		footer.createEl("span", {
			text: `${PALETTES.length} palettes available`,
			cls: "agc-meta",
		});
	}
}
