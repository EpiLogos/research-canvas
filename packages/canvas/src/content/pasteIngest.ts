export interface IngestItem {
  kind: "text" | "markdown" | "image";
  mimeType: string;
}

export interface TextIngest extends IngestItem {
  kind: "text";
  text: string;
}

export interface MarkdownIngest extends IngestItem {
  kind: "markdown";
  text: string;
  fileName: string;
}

export interface ImageIngest extends IngestItem {
  kind: "image";
  file: File;
  fileName: string;
}

export type IngestResult = TextIngest | MarkdownIngest | ImageIngest;

interface IngestInput {
  files: { name: string; type: string; file: File }[];
  text: string;
}

function isImage(type: string, name: string): boolean {
  if (type.startsWith("image/")) {
    return true;
  }
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(name);
}

function isMarkdown(type: string, name: string): boolean {
  if (type === "text/markdown") {
    return true;
  }
  return /\.(md|markdown|mdown|mkd)$/i.test(name);
}

function classify(input: IngestInput): IngestResult[] {
  const results: IngestResult[] = [];

  for (const entry of input.files) {
    if (isImage(entry.type, entry.name)) {
      results.push({
        kind: "image",
        mimeType: entry.type || "image/png",
        file: entry.file,
        fileName: entry.name,
      });
      continue;
    }
    if (isMarkdown(entry.type, entry.name)) {
      results.push({
        kind: "markdown",
        mimeType: entry.type || "text/markdown",
        text: "",
        fileName: entry.name,
      });
    }
  }

  if (results.length === 0 && input.text.trim().length > 0) {
    results.push({ kind: "text", mimeType: "text/plain", text: input.text });
  }

  return results;
}

export function classifyDropItems(input: IngestInput): IngestResult[] {
  return classify(input);
}

export function classifyPasteItems(input: IngestInput): IngestResult[] {
  return classify(input);
}
