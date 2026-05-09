# Auto Graph Color

Auto-color the Obsidian graph view by clustering your vault's link structure.

The plugin walks your vault's wikilinks, runs Louvain community detection to find tightly-connected clusters of notes, optionally asks Claude to give each cluster a human-readable name, and then writes a `colorGroups` payload into `graph.json` so each cluster shows up as a distinct color in the graph view. You flip through palette variations in a modal, save the ones you like, and apply with one click.

## Install

**Via [BRAT](https://github.com/TfTHacker/obsidian42-brat) (recommended for now):**
1. Install BRAT from Community plugins.
2. Open BRAT settings → "Add beta plugin" → paste this repo's URL.
3. Enable "Auto Graph Color" under Community plugins.

**Manual install:**
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [release](../../releases).
2. Drop them into `<your-vault>/.obsidian/plugins/auto-graph-color/`.
3. Reload Obsidian and enable the plugin under Community plugins.

## Usage

- **Generate**: click the palette ribbon icon, or run `Auto Graph Color: Generate color palettes`.
- **Flip palettes**: use ◀ ▶ in the modal, or click any palette in the strip.
- **Apply**: writes the colors to `graph.json` and reloads the graph view (brief flicker is expected — see Notes).
- **Favorite**: save a palette you like; browse later via `Auto Graph Color: Browse favorites`.
- **Reroll**: draw a fresh batch of palettes for the same clustering.
- **Re-analyze**: re-run the index → cluster pipeline (do this after big vault changes).

## Settings

- **Anthropic API key** — optional. With one, Claude names each cluster (`"daily journals"`, `"product ideas"`). Without one, falls back to folder/type heuristics. Get a key at [console.anthropic.com](https://console.anthropic.com).
- **Model** — Anthropic model id used for naming. Defaults to `claude-sonnet-4-5-20250929`.
- **Target cluster count** — soft target the Louvain resolution tunes toward.
- **Variations per batch** — how many palettes to flip through at a time.
- **Exclude folders** — comma-separated path prefixes to skip when indexing (e.g. `raw/, archive/`). Useful for ingested or archival material you don't want clustered.
- **Show debug commands** — surfaces `Debug:` commands in the command palette for troubleshooting. Off by default.

## How it works

1. **Index**: walks every markdown file in the vault (minus excluded folders), pulls outbound wikilinks.
2. **Cluster**: builds an undirected note-link graph with [graphology](https://graphology.github.io/), runs Louvain community detection. Resolution is tuned toward your target cluster count.
3. **Name** (optional): sends each cluster's notes to Claude, gets back a short name and a query string that picks out the cluster's members.
4. **Color**: builds an Obsidian `colorGroup` payload for each cluster (one query, one color from the chosen palette), writes it into `graph.json` via the core graph plugin's own `saveOptions()`, and reloads the open graph view.

## Notes

- **Graph view flickers on Apply** — the plugin tears down and reattaches the graph leaf so it reads the new colors fresh. This is intentional: an earlier version mutated the live engine in place and would corrupt state on the second apply. The flicker is the safe path.
- **Uses undocumented internals** — reaches into `app.internalPlugins.plugins.graph.instance` to keep in-memory and on-disk state consistent. Same path the [Sync Graph Settings](https://github.com/jvsteiner/sync-graph-settings) plugin uses; stable across Obsidian 1.x.
- **Desktop only** — `isDesktopOnly: true` because of the internals access. Mobile is unproven.
- **API costs** — Claude naming uses a single small request per generate (couple thousand input tokens, hundreds of output). Negligible at typical use.

## License

MIT — see [LICENSE](LICENSE).
