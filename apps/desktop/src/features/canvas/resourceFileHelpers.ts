import { convertFileSrc, isTauri } from "@tauri-apps/api/core";

interface DeriveResourceImportPlanInput {
  absolutePath: string;
  resourceRoots: string[];
}

interface ResourceImportPlan {
  kind: "markdown" | "image" | "pdf" | "text" | "binary";
  relativePath: string;
  rootPath: string;
  shouldAttachRoot: boolean;
  title: string;
}

const MARKDOWN_EXTENSIONS = new Set(["md", "mdx", "markdown"]);
const IMAGE_EXTENSIONS = new Set(["avif", "gif", "jpeg", "jpg", "png", "svg", "webp"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const TEXT_EXTENSIONS = new Set(["csv", "json", "log", "txt", "yaml", "yml"]);

export function deriveResourceImportPlan({
  absolutePath,
  resourceRoots,
}: DeriveResourceImportPlanInput): ResourceImportPlan {
  const normalizedPath = normalizePath(absolutePath);
  const matchingRoot = findDeepestMatchingRoot(normalizedPath, resourceRoots);
  const rootPath = matchingRoot ?? dirname(normalizedPath);
  const relativePath = stripRootPrefix(normalizedPath, rootPath);

  return {
    kind: kindFromPath(normalizedPath),
    relativePath,
    rootPath,
    shouldAttachRoot: matchingRoot === null,
    title: basename(normalizedPath),
  };
}

export function toAssetUrl(absolutePath: string) {
  const normalizedPath = normalizePath(absolutePath);
  // Tauri's native converter deliberately encodes the *whole* path. In
  // particular, `/Users/...` becomes `/%2FUsers...`; the asset handler strips
  // the URL separator and then decodes this back to an absolute filesystem
  // path. Constructing `asset://localhost/Users/...` by hand loses that slash
  // and produces a relative lookup (the broken-image question mark).
  if (isTauri()) return convertFileSrc(normalizedPath);
  return `asset://localhost/${encodeURIComponent(normalizedPath)}`;
}

/**
 * Turns a portable workspace-relative asset reference into a URL that Tauri's
 * asset protocol can render. URLs from the web and already-resolved Tauri
 * URLs stay untouched so a document can safely mix local and remote media.
 */
export function resolveWorkspaceAssetUrl(url: string, workspaceRoot: string | null | undefined): string {
  const value = url.trim();
  if (!value) return value;

  const normalized = value.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[a-z]:\//i.test(normalized)) return toAssetUrl(normalized);

  const normalizedAssetUrl = normalizeLegacyAssetUrl(value);
  if (normalizedAssetUrl !== value) return normalizedAssetUrl;
  if (hasUrlScheme(value)) return value;
  if (!workspaceRoot) return value;

  if (!isSafeWorkspaceAssetPath(normalized)) return value;
  return toAssetUrl(`${normalizePath(workspaceRoot)}/${normalized}`);
}

/**
 * Converts image block URLs only for display. The underlying node document
 * keeps the workspace-relative URL, which remains valid if the workspace is
 * moved or exported.
 */
export function resolveBlockNoteAssetUrls(body: string, workspaceRoot: string | null | undefined): string {
  return mapBlockNoteImageUrls(body, (url) => resolveWorkspaceAssetUrl(url, workspaceRoot));
}

/** Restores Tauri display URLs to the portable workspace-relative form before saving. */
export function restoreBlockNoteAssetUrls(body: string, workspaceRoot: string | null | undefined): string {
  if (!workspaceRoot) return body;
  const normalizedRoot = normalizePath(workspaceRoot);
  return mapBlockNoteImageUrls(body, (url) => {
    const absolutePath = assetUrlToAbsolutePath(url);
    if (!absolutePath || !absolutePath.startsWith(`${normalizedRoot}/`)) return url;
    const relative = absolutePath.slice(normalizedRoot.length + 1);
    if (!isSafeWorkspaceAssetPath(relative)) return url;
    return relative;
  });
}

function kindFromPath(absolutePath: string): ResourceImportPlan["kind"] {
  const extension = extensionFromPath(absolutePath);
  if (MARKDOWN_EXTENSIONS.has(extension)) return "markdown";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (PDF_EXTENSIONS.has(extension)) return "pdf";
  if (TEXT_EXTENSIONS.has(extension)) return "text";
  return "binary";
}

function findDeepestMatchingRoot(absolutePath: string, resourceRoots: string[]) {
  const normalizedRoots = resourceRoots
    .map((root) => normalizePath(root))
    .filter((root) => root.length > 0)
    .sort((left, right) => right.length - left.length);

  return (
    normalizedRoots.find(
      (root) =>
        absolutePath === root || absolutePath.startsWith(`${root}/`)
    ) ?? null
  );
}

function stripRootPrefix(absolutePath: string, rootPath: string) {
  if (absolutePath === rootPath) {
    return basename(absolutePath);
  }

  return absolutePath.slice(rootPath.length + 1);
}

function extensionFromPath(absolutePath: string) {
  const filename = basename(absolutePath).toLowerCase();
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex === -1 ? "" : filename.slice(dotIndex + 1);
}

function basename(absolutePath: string) {
  const normalizedPath = normalizePath(absolutePath);
  const parts = normalizedPath.split("/");
  return parts[parts.length - 1] ?? normalizedPath;
}

function dirname(absolutePath: string) {
  const normalizedPath = normalizePath(absolutePath);
  const parts = normalizedPath.split("/");
  parts.pop();
  if (parts.length === 0) return "/";
  if (parts.length === 1 && parts[0] === "") return "/";
  return parts.join("/");
}

function normalizePath(path: string) {
  return path.trim().replace(/\\/g, "/").replace(/\/+$/g, "") || "/";
}

function hasUrlScheme(value: string) {
  return /^[a-z][a-z\d+.-]*:/i.test(value);
}

function normalizeLegacyAssetUrl(url: string) {
  const prefix = "asset://localhost/";
  if (!url.startsWith(prefix)) return url;
  const encodedPath = url.slice(prefix.length);
  // The native macOS/Linux format is `asset://localhost/%2Fabsolute%2Fpath`.
  // Keep valid values unchanged and only repair the manually built legacy form.
  if (/^%2f/i.test(encodedPath)) return url;
  try {
    const decodedPath = decodeURIComponent(encodedPath);
    const absolutePath = decodedPath.startsWith("/") || /^[a-z]:\//i.test(decodedPath)
      ? decodedPath
      : `/${decodedPath}`;
    return toAssetUrl(absolutePath);
  } catch {
    return url;
  }
}

function assetUrlToAbsolutePath(url: string): string | null {
  const prefixes = ["asset://localhost/", "http://asset.localhost/"];
  const prefix = prefixes.find((candidate) => url.startsWith(candidate));
  if (!prefix) return null;
  try {
    return decodeURIComponent(url.slice(prefix.length)).replace(/\\/g, "/");
  } catch {
    return null;
  }
}

function isSafeWorkspaceAssetPath(value: string) {
  const parts = value.split("/");
  return parts.length > 1
    && parts[0] === "assets"
    && parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}

function mapBlockNoteImageUrls(body: string, mapUrl: (url: string) => string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }
  if (!Array.isArray(parsed)) return body;

  let changed = false;
  const mapped = mapBlockNoteValue(parsed, mapUrl, () => { changed = true; });
  return changed ? JSON.stringify(mapped) : body;
}

function mapBlockNoteValue(
  value: unknown,
  mapUrl: (url: string) => string,
  markChanged: () => void,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => mapBlockNoteValue(item, mapUrl, markChanged));
  }
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  const mapped: Record<string, unknown> = { ...record };
  if (record.type === "image" && record.props && typeof record.props === "object") {
    const props = record.props as Record<string, unknown>;
    if (typeof props.url === "string") {
      const nextUrl = mapUrl(props.url);
      if (nextUrl !== props.url) {
        mapped.props = { ...props, url: nextUrl };
        markChanged();
      }
    }
  }
  if (Array.isArray(record.children)) {
    mapped.children = record.children.map((child) => mapBlockNoteValue(child, mapUrl, markChanged));
  }
  return mapped;
}
