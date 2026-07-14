import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

import { useEffect, useMemo } from "react";
import type { Block, PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";

import { isEmptyBlockNoteBody } from "@research-canvas/node-document";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

interface BlockNoteDocumentProps {
  body: string;
  editable?: boolean;
  onChange?: (body: string) => void;
  className?: string;
  /** Mirrors the node-document store status; drives the visible save-failure indicator. */
  saveState?: SaveState;
  /** Message shown alongside the failure indicator when saveState === "error". */
  saveErrorMessage?: string | null;
}

function parseInitialContent(body: string): PartialBlock[] | undefined {
  if (isEmptyBlockNoteBody(body)) {
    return undefined; // BlockNote seeds a single empty paragraph
  }
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as PartialBlock[];
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Editable full-page BlockNote document. Seeds from `body` (a block-array JSON
 * string) and emits the serialised document via `onChange` on every edit.
 */
export function BlockNoteDocument({
  body,
  editable = true,
  onChange,
  className,
  saveState = "idle",
  saveErrorMessage = null,
}: BlockNoteDocumentProps) {
  const initialContent = useMemo(() => parseInitialContent(body), [body]);
  const editor = useCreateBlockNote({ initialContent });

  // `useCreateBlockNote` deliberately treats initialContent as mount-time
  // state. A reader, however, can receive an attachment/body revision while
  // it remains open, so replace the read-only projection explicitly. Editable
  // documents remain store-owned and must never be reset during typing.
  useEffect(() => {
    if (!editable) {
      editor.replaceBlocks(
        editor.document,
        parseInitialContent(body) ?? [{ type: "paragraph" }],
      );
    }
  }, [body, editable, editor]);

  return (
    <div className={["blocknote-document", className].filter(Boolean).join(" ")}>
      {saveState === "error" ? (
        <div className="blocknote-document__save-error" role="alert">
          <span className="blocknote-document__save-error-label">Save failed</span>
          {saveErrorMessage ? (
            <span className="blocknote-document__save-error-detail">
              {saveErrorMessage}
            </span>
          ) : null}
        </div>
      ) : null}
      <BlockNoteView
        editor={editor}
        editable={editable}
        onChange={() => {
          const doc: Block[] = editor.document;
          onChange?.(JSON.stringify(doc));
        }}
      />
    </div>
  );
}
