import { toAssetUrl } from "../canvas/resourceFileHelpers";

export type ReaderSourceProvenance = "Node metadata" | "Long-form document" | "QL framing";

export interface ReaderSource {
  coordinate: string;
  provenance: ReaderSourceProvenance[];
}

interface ReaderSourceInput {
  sourceCoordinates: string[];
  bodySourceCoordinates: string[];
  qlSourceCoordinates?: string[];
}

/**
 * Source coordinates can be declared by the canonical graph node, its rich
 * document, or a QL unit. Keep those origins visible even where they point at
 * the same file/anchor: a source is evidence, not merely a deduped string.
 */
export function collectReaderSources(input: ReaderSourceInput): ReaderSource[] {
  const sources = new Map<string, ReaderSource>();
  const add = (coordinates: string[], provenance: ReaderSourceProvenance) => {
    for (const coordinate of coordinates) {
      const normalized = coordinate.trim();
      if (!normalized) continue;
      const existing = sources.get(normalized);
      if (existing) {
        if (!existing.provenance.includes(provenance)) existing.provenance.push(provenance);
      } else {
        sources.set(normalized, { coordinate: normalized, provenance: [provenance] });
      }
    }
  };
  add(input.sourceCoordinates, "Node metadata");
  add(input.bodySourceCoordinates, "Long-form document");
  add(input.qlSourceCoordinates ?? [], "QL framing");
  return [...sources.values()];
}

export function ReaderSources({
  sources,
  workspaceRoot,
}: {
  sources: ReaderSource[];
  workspaceRoot: string | null | undefined;
}) {
  if (sources.length === 0) return <span className="reader-sources__empty">No source coordinates recorded</span>;

  return (
    <ul className="reader-sources" aria-label="Source files">
      {sources.map((source) => {
        const href = sourceCoordinateHref(source.coordinate, workspaceRoot);
        return (
          <li key={source.coordinate} className="reader-sources__item">
            {href ? (
              <a href={href} className="reader-sources__link" title={`Open ${source.coordinate}`}>
                {source.coordinate}
              </a>
            ) : (
              <span className="reader-sources__coordinate">{source.coordinate}</span>
            )}
            <span className="reader-sources__provenance">{source.provenance.join(" · ")}</span>
          </li>
        );
      })}
    </ul>
  );
}

function sourceCoordinateHref(
  coordinate: string,
  workspaceRoot: string | null | undefined,
): string | null {
  const hashIndex = coordinate.indexOf("#");
  const rawFilePath = (hashIndex === -1 ? coordinate : coordinate.slice(0, hashIndex)).trim();
  const fragment = hashIndex === -1 ? "" : coordinate.slice(hashIndex + 1).trim();
  if (!rawFilePath || rawFilePath === "." || rawFilePath.startsWith("#")) return null;

  const filePath = rawFilePath.startsWith("vault-file:")
    ? rawFilePath.slice("vault-file:".length)
    : rawFilePath;
  const external = /^https?:\/\//i.test(filePath);
  const absolute = filePath.startsWith("/");
  const looksLikeFile = /\.[a-z\d]{1,8}$/i.test(filePath);
  if (!looksLikeFile || (!external && !absolute && filePath.includes(".."))) return null;

  const rootName = workspaceRoot?.replace(/\\/g, "/").replace(/\/+$/, "").split("/").at(-1);
  const workspaceRelativePath = rootName && filePath.startsWith(`${rootName}/`)
    ? filePath.slice(rootName.length + 1)
    : filePath;

  const href = external
    ? filePath
    : absolute
      ? toAssetUrl(filePath)
    : workspaceRoot
      ? toAssetUrl(`${workspaceRoot.replace(/\/+$/, "")}/${workspaceRelativePath}`)
      : null;
  if (!href) return null;
  return fragment ? `${href}#${encodeURIComponent(fragment)}` : href;
}
