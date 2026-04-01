import { useViewport } from "@xyflow/react";

export type ZoomLevel = "dot" | "pill" | "card";

export interface AdaptiveNodeStyle {
  dotColour?: string;
  bgColour?: string;
  textColour?: string;
  thumbnail?: string;
}

function getZoomLevel(zoom: number): ZoomLevel {
  if (zoom < 0.4) return "dot";
  if (zoom < 0.8) return "pill";
  return "card";
}

function defaultDotColour(nodeType: string): string {
  switch (nodeType) {
    case "resource": return "#4a4aff";
    case "note":     return "#9b59b6";
    case "group":    return "#e67e22";
    case "portal":   return "#1abc9c";
    default:         return "#4a4aff";
  }
}

interface AdaptiveNodeProps {
  nodeType: "resource" | "note" | "group" | "portal";
  title: string;
  summary?: string;
  selected?: boolean;
  style?: AdaptiveNodeStyle;
  resourceKind?: string;
  absolutePath?: string;
}

export function AdaptiveNode({ nodeType, title, summary, selected, style, resourceKind, absolutePath }: AdaptiveNodeProps) {
  const { zoom } = useViewport();
  const level = getZoomLevel(zoom);

  const dotColour = style?.dotColour ?? defaultDotColour(nodeType);
  const bgColour = style?.bgColour;
  const textColour = style?.textColour;

  return (
    <div
      className={`adaptive-node adaptive-node--${level}`}
      data-type={nodeType}
      data-selected={selected ? "true" : undefined}
      style={
        {
          "--dot-colour": dotColour,
          "--node-bg": bgColour,
          "--node-text": textColour,
          width: "100%",
          height: "100%",
          overflow: "hidden",
        } as React.CSSProperties
      }
    >
      <span className="an-dot" />
      {level !== "dot" && <span className="an-label">{title}</span>}
      {level === "card" && (
        <>
          <span className="an-type">{nodeType}</span>
          {resourceKind === "image" && absolutePath ? (
            <img
              className="an-thumbnail"
              src={`asset://localhost/${absolutePath}`}
              alt=""
            />
          ) : style?.thumbnail ? (
            <img className="an-thumbnail" src={style.thumbnail} alt="" />
          ) : null}
          {summary && <span className="an-summary">{summary}</span>}
        </>
      )}
    </div>
  );
}
