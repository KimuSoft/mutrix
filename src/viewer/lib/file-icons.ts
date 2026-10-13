import {
  siReact,
  siTypescript,
  siJavascript,
  siJson,
  siCss,
  siHtml5,
  siMarkdown,
  siPython,
  siGo,
  siRust,
  siYaml,
  siToml,
  siDocker,
  siSvelte,
  type SimpleIcon,
} from "simple-icons";

const extensions: Record<string, SimpleIcon> = {
  tsx: siReact,
  jsx: siReact,
  ts: siTypescript,
  mts: siTypescript,
  cts: siTypescript,
  js: siJavascript,
  mjs: siJavascript,
  cjs: siJavascript,
  json: siJson,
  jsonc: siJson,
  css: siCss,
  html: siHtml5,
  htm: siHtml5,
  md: siMarkdown,
  mdx: siMarkdown,
  markdown: siMarkdown,
  py: siPython,
  pyi: siPython,
  go: siGo,
  rs: siRust,
  yaml: siYaml,
  yml: siYaml,
  toml: siToml,
  svelte: siSvelte,
};

export type FileIcon = Pick<SimpleIcon, "slug" | "path"> & { stroke?: boolean };

// Lucide FlaskConical (ISC): one shared outline for the DOM and Canvas renderers.
const testIcon: FileIcon = {
  slug: "test",
  stroke: true,
  path: "M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2 M6.453 15h11.094 M8.5 2h7",
};

/** Shared SVG paths for DOM and Canvas; no image fetches are needed. */
export function fileIcon(path: string): FileIcon | undefined {
  const name = path.replace(/\\/g, "/").split("/").at(-1)!.toLowerCase();
  if (name.endsWith(".test.ts")) return testIcon;
  if (name === "dockerfile" || name.startsWith("dockerfile.")) return siDocker;
  if (!name.includes(".")) return undefined;
  return extensions[name.split(".").at(-1)!];
}
