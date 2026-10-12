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
  yaml: siYaml,
  yml: siYaml,
  toml: siToml,
  svelte: siSvelte,
};

/** Shared SVG paths for DOM and Canvas; no image fetches are needed. */
export function fileIcon(path: string): SimpleIcon | undefined {
  const name = path.replace(/\\/g, "/").split("/").at(-1)!.toLowerCase();
  if (name === "dockerfile" || name.startsWith("dockerfile.")) return siDocker;
  if (!name.includes(".")) return undefined;
  return extensions[name.split(".").at(-1)!];
}
