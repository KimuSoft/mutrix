import { diffArrays } from "diff";

/** Physical lines: empty files have none; terminal newline is not an extra line. */
export function physicalLines(text: string): string[] {
  if (!text) return [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (text.endsWith("\n")) lines.pop();
  return lines;
}

export function changedLines(
  before: string,
  after: string,
): { added: number[]; removed: number[] } {
  let oldLine = 0;
  let newLine = 0;
  const added: number[] = [];
  const removed: number[] = [];
  for (const part of diffArrays(physicalLines(before), physicalLines(after))) {
    if (part.added) {
      for (let i = 0; i < part.count; i++) added.push(newLine++);
    } else if (part.removed) {
      for (let i = 0; i < part.count; i++) removed.push(oldLine++);
    } else {
      oldLine += part.count;
      newLine += part.count;
    }
  }
  return { added, removed };
}
