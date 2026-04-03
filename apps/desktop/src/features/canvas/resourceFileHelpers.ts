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
  return `asset://localhost${encodeURI(normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`)}`;
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
