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
  const rootedPath = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  return `asset://localhost${rootedPath.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Turns a portable workspace-relative asset reference into a URL that Tauri's
 * asset protocol can render. URLs from the web and already-resolved Tauri
 * URLs stay untouched so a document can safely mix local and remote media.
 */
export function resolveWorkspaceAssetUrl(url: string, workspaceRoot: string | null | undefined): string {
  const value = url.trim();
  if (!value || !workspaceRoot) return value;

  const normalized = value.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[a-z]:\//i.test(normalized)) return toAssetUrl(normalized);
  if (hasUrlScheme(value)) return value;
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
  const workspaceAssetPrefix = `${toAssetUrl(workspaceRoot)}/`;
  return mapBlockNoteImageUrls(body, (url) => {
    if (!url.startsWith(workspaceAssetPrefix)) return url;
    const relative = url.slice(workspaceAssetPrefix.length);
    if (!isSafeWorkspaceAssetPath(relative)) return url;
    try {
      return decodeURIComponent(relative);
    } catch {
      return url;
    }
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
