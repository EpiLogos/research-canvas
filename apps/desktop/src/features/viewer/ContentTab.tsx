import { useEffect, useState } from "react";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import { readWorkspaceTextFile } from "@research-canvas/desktop-api";
import { NodeContentPane } from "./NodeContentPane";

interface ContentTabProps {
  onFullScreen: () => void;
}

export function ContentTab({ onFullScreen }: ContentTabProps) {
  const workspace = useCanvasWorkspace();
  const node = workspace.nodes.find((n) => n.id === workspace.selectedNodeId) ?? null;
  const textResourceNode =
    node?.type === "resource" &&
    node.absolutePath &&
    (node.resourceKind === "markdown" || node.resourceKind === "text")
      ? node
      : null;
  const [textContent, setTextContent] = useState<string | null>(null);

  useEffect(() => {
    setTextContent(null);
    if (!textResourceNode) return;
    readWorkspaceTextFile(textResourceNode.absolutePath)
      .then(setTextContent)
      .catch(() => setTextContent(null));
  }, [textResourceNode]);

  if (!node) {
    return <div className="content-tab-empty">No node selected</div>;
  }

  return (
    <NodeContentPane
      node={node}
      textContent={textContent}
      onFullScreen={onFullScreen}
      onNoteContentChange={(content) => workspace.updateNodeContent(node.id, content)}
    />
  );
}
