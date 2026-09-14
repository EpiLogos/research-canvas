/**
 * WebVTT parsing for story media playback sync (vision §3.16, research
 * findings §3): browser-native audio/video + WebVTT cues with passage
 * highlighting during playback. The parser handles the cue timings used by
 * transcript pipelines (hh:mm:ss.mmm and mm:ss.mmm) plus settings lines and
 * cue identifiers, and skips malformed cues instead of failing the whole
 * transcript.
 */

export interface VttCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
}

const CUE_TIMING =
  /^(?:(\d{2,}):)?(\d{1,2}):(\d{2})\.(\d{3})\s*-->\s*(?:(\d{2,}):)?(\d{1,2}):(\d{2})\.(\d{3})/;

export function parseWebVtt(text: string): VttCue[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const cues: VttCue[] = [];
  let pendingId: string | null = null;
  let current: { startMs: number; endMs: number; text: string[] } | null = null;

  const flush = () => {
    if (current) {
      cues.push({
        id: pendingId ?? `cue-${cues.length}`,
        startMs: current.startMs,
        endMs: current.endMs,
        text: current.text.join("\n").trim(),
      });
    }
    pendingId = null;
    current = null;
  };

  for (const line of lines) {
    if (current) {
      if (line.trim() === "") {
        flush();
      } else if (!line.startsWith("NOTE")) {
        current.text.push(line);
      }
      continue;
    }
    if (line.trim() === "WEBVTT" || line.trim().startsWith("WEBVTT ")) {
      continue;
    }
    if (line.trim() === "" || line.startsWith("NOTE")) {
      pendingId = null;
      continue;
    }
    const match = line.match(CUE_TIMING);
    if (match) {
      current = {
        startMs: timingToMs(
          Number(match[1] ?? 0),
          Number(match[2]),
          Number(match[3]),
          Number(match[4]),
        ),
        endMs: timingToMs(
          Number(match[5] ?? 0),
          Number(match[6]),
          Number(match[7]),
          Number(match[8]),
        ),
        text: [],
      };
      const rest = line.slice(match[0].length);
      if (rest.includes("position:") || rest.includes("align:") || rest.includes("line:")) {
        // Settings line; cue text begins on the next non-empty line.
      }
    } else if (!/\d+:\d{2}/.test(line) && !line.includes("-->")) {
      // A cue identifier sits on its own line before the timing.
      pendingId = line.trim();
    }
  }
  flush();
  return cues;
}

function timingToMs(hours: number, minutes: number, seconds: number, millis: number): number {
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

/** Cues overlapping the given timestamp range, in order. */
export function cuesForTimestampRange(
  cues: VttCue[],
  startMs: number,
  endMs: number,
): VttCue[] {
  return cues.filter((cue) => cue.endMs > startMs && cue.startMs < endMs);
}

/** The active cue at a playback time, or null between cues. */
export function activeCue(cues: VttCue[], timeMs: number): VttCue | null {
  return cues.find((cue) => timeMs >= cue.startMs && timeMs < cue.endMs) ?? null;
}
