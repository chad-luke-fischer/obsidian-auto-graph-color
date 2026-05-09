import { App, PluginSettingTab, Setting } from "obsidian";
import type AutoGraphColorPlugin from "../main";

export class AutoGraphColorSettingTab extends PluginSettingTab {
	plugin: AutoGraphColorPlugin;

	constructor(app: App, plugin: AutoGraphColorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Auto Graph Color" });

		new Setting(containerEl)
			.setName("Anthropic API key")
			.setDesc(
				"Used to name and refine clusters. Get one at console.anthropic.com. Leave empty to fall back to heuristic naming (path/folder/type-based).",
			)
			.addText((text) =>
				text
					.setPlaceholder("sk-ant-...")
					.setValue(this.plugin.data.settings.anthropicApiKey)
					.onChange(async (v) => {
						this.plugin.data.settings.anthropicApiKey = v.trim();
						await this.plugin.savePluginData();
					}),
			);

		new Setting(containerEl)
			.setName("Use Claude for cluster naming")
			.setDesc("If off, clusters are named purely by folder/type heuristics.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.data.settings.useClaudeForNaming)
					.onChange(async (v) => {
						this.plugin.data.settings.useClaudeForNaming = v;
						await this.plugin.savePluginData();
					}),
			);

		new Setting(containerEl)
			.setName("Model")
			.setDesc("Anthropic model id used for cluster naming.")
			.addText((text) =>
				text
					.setPlaceholder("claude-sonnet-4-5-20250929")
					.setValue(this.plugin.data.settings.model)
					.onChange(async (v) => {
						this.plugin.data.settings.model = v.trim() || "claude-sonnet-4-5-20250929";
						await this.plugin.savePluginData();
					}),
			);

		new Setting(containerEl)
			.setName("Target cluster count")
			.setDesc("Soft target — Louvain resolution will tune toward this many clusters.")
			.addSlider((s) =>
				s
					.setLimits(3, 30, 1)
					.setValue(this.plugin.data.settings.clusterCountTarget)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.data.settings.clusterCountTarget = v;
						await this.plugin.savePluginData();
					}),
			);

		new Setting(containerEl)
			.setName("Variations per batch")
			.setDesc("How many palettes to flip through at a time.")
			.addSlider((s) =>
				s
					.setLimits(2, 10, 1)
					.setValue(this.plugin.data.settings.variationsPerBatch)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.data.settings.variationsPerBatch = v;
						await this.plugin.savePluginData();
					}),
			);

		new Setting(containerEl)
			.setName("Exclude folders")
			.setDesc(
				"Comma-separated list of vault-relative path prefixes to skip during indexing (e.g. `raw/, archive/`). Useful for ingested or archival content you don't want clustered.",
			)
			.addText((text) =>
				text
					.setPlaceholder("raw/, archive/")
					.setValue(
						(this.plugin.data.settings.excludeFolders ?? []).join(", "),
					)
					.onChange(async (v) => {
						this.plugin.data.settings.excludeFolders = v
							.split(",")
							.map((s) => s.trim())
							.filter(Boolean);
						await this.plugin.savePluginData();
					}),
			);

		new Setting(containerEl)
			.setName("Show debug commands")
			.setDesc(
				"Surface diagnostic commands (`Debug: test apply`, `Debug: dump graph view internals`) in the command palette. Reload the plugin after toggling for the change to take effect.",
			)
			.addToggle((t) =>
				t
					.setValue(this.plugin.data.settings.showDebugCommands)
					.onChange(async (v) => {
						this.plugin.data.settings.showDebugCommands = v;
						await this.plugin.savePluginData();
					}),
			);
	}
}
