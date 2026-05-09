import { App, TFile, getAllTags, parseFrontMatterTags } from "obsidian";
import { IndexedNote } from "./types";

/**
 * Walk every markdown file in the vault and build an IndexedNote per file.
 * Cheap (uses Obsidian's metadata cache; no file content reads except for the snippet).
 *
 * `excludeFolders` is a list of vault-relative path prefixes (e.g. ["raw/"])
 * — any file whose path starts with one of these is skipped entirely.
 */
export async function indexVault(
	app: App,
	excludeFolders: string[] = [],
): Promise<IndexedNote[]> {
	const allFiles = app.vault.getMarkdownFiles();
	const files = allFiles.filter((f) => !isExcluded(f.path, excludeFolders));
	const out: IndexedNote[] = [];

	// Pre-build a basename → path map so we can resolve wikilinks robustly.
	const basenameToPath = new Map<string, string>();
	for (const f of files) {
		basenameToPath.set(f.basename.toLowerCase(), f.path);
	}

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		const tags = collectTags(cache);

		// Resolve wikilinks. Use the metadataCache's resolvedLinks for accuracy.
		// Skip links into excluded folders so they don't anchor clusters.
		const resolved = app.metadataCache.resolvedLinks[file.path] ?? {};
		const links = Object.keys(resolved).filter(
			(p) => !isExcluded(p, excludeFolders),
		);

		out.push({
			path: file.path,
			basename: file.basename,
			folder: parentFolder(file.path),
			frontmatterType: typeof fm?.type === "string" ? fm.type : undefined,
			frontmatterKind: typeof fm?.kind === "string" ? fm.kind : undefined,
			tags,
			snippet: await readSnippet(app, file, 320),
			links,
		});
	}

	return out;
}

function parentFolder(path: string): string {
	const i = path.lastIndexOf("/");
	return i === -1 ? "" : path.slice(0, i);
}

function isExcluded(path: string, excludeFolders: string[]): boolean {
	for (const prefix of excludeFolders) {
		if (!prefix) continue;
		const norm = prefix.endsWith("/") ? prefix : prefix + "/";
		if (path === prefix.replace(/\/$/, "")) return true;
		if (path.startsWith(norm)) return true;
	}
	return false;
}

function collectTags(cache: ReturnType<App["metadataCache"]["getFileCache"]>): string[] {
	if (!cache) return [];
	const all = getAllTags(cache) ?? [];
	const set = new Set<string>();
	for (const t of all) {
		set.add(t.replace(/^#/, "").toLowerCase());
	}
	// Also pick up frontmatter tags array if metadataCache missed any.
	const fmTags = parseFrontMatterTags(cache.frontmatter ?? null) ?? [];
	for (const t of fmTags) set.add(t.replace(/^#/, "").toLowerCase());
	return [...set];
}

/** Read the first ~N chars of a file, stripping YAML frontmatter. */
async function readSnippet(app: App, file: TFile, maxChars: number): Promise<string> {
	try {
		const raw = await app.vault.cachedRead(file);
		const body = stripFrontmatter(raw).trim();
		return body.slice(0, maxChars).replace(/\s+/g, " ");
	} catch {
		return "";
	}
}

function stripFrontmatter(raw: string): string {
	if (!raw.startsWith("---")) return raw;
	const end = raw.indexOf("\n---", 3);
	if (end === -1) return raw;
	return raw.slice(end + 4);
}
