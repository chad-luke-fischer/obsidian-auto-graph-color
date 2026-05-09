import { App, Modal, Notice } from "obsidian";
import { FavoriteVariation } from "../types";
import { applyVariation } from "../graphConfig";

type Callbacks = {
	getFavorites: () => FavoriteVariation[];
	deleteFavorite: (id: string) => Promise<void>;
};

/** Browse + apply previously favorited variations. */
export class FavoritesModal extends Modal {
	private callbacks: Callbacks;

	constructor(app: App, callbacks: Callbacks) {
		super(app);
		this.callbacks = callbacks;
	}

	onOpen(): void {
		this.modalEl.addClass("agc-modal");
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Favorited Color Schemes" });

		const favs = this.callbacks.getFavorites();
		if (favs.length === 0) {
			contentEl.createEl("p", {
				text: "No favorites yet. Run \"Auto Graph Color: Generate\" and click ♥ on a variation you like.",
				cls: "agc-subtitle",
			});
			return;
		}

		const list = contentEl.createDiv({ cls: "agc-fav-list" });
		for (const fav of favs) {
			const row = list.createDiv({ cls: "agc-fav-row" });

			const swatchRow = row.createDiv({ cls: "agc-fav-swatches" });
			fav.palette.colors.slice(0, 8).forEach((c) => {
				const s = swatchRow.createDiv({ cls: "agc-swatch-mini" });
				s.style.backgroundColor = c;
			});

			const meta = row.createDiv({ cls: "agc-fav-meta" });
			meta.createEl("div", { cls: "agc-fav-name", text: fav.label ?? fav.palette.name });
			meta.createEl("div", {
				cls: "agc-fav-sub",
				text: `${fav.clusters.length} clusters · saved ${formatDate(fav.favoritedAt)}`,
			});

			const actions = row.createDiv({ cls: "agc-fav-actions" });
			const applyBtn = actions.createEl("button", { text: "Apply" });
			applyBtn.addEventListener("click", async () => {
				await applyVariation(this.app, fav);
			});
			const delBtn = actions.createEl("button", { text: "Delete" });
			delBtn.addEventListener("click", async () => {
				await this.callbacks.deleteFavorite(fav.id);
				new Notice("Favorite deleted.");
				this.render();
			});
		}
	}
}

function formatDate(ms: number): string {
	const d = new Date(ms);
	return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
