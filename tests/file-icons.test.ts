import { expect, test } from "bun:test";
import { fileIcon } from "../src/viewer/lib/file-icons";

test("React and TypeScript files use distinct logos across module extensions", () => {
  for (const path of ["src/App.tsx", "src/App.jsx", "C:\\app\\App.TSX"])
    expect(fileIcon(path)?.slug).toBe("react");
  for (const path of ["src/parser.ts", "src/parser.mts", "src/parser.cts", "src/types.d.ts"])
    expect(fileIcon(path)?.slug).toBe("typescript");
  for (const path of ["src/app.js", "src/app.mjs", "src/app.cjs"])
    expect(fileIcon(path)?.slug).toBe("javascript");
});

test("Common text formats have SVG paths and unknown files keep the fallback", () => {
  for (const path of [
    "package.json",
    "config.jsonc",
    "styles.css",
    "index.html",
    "README.md",
    "a.py",
    "a.go",
    "a.yml",
    "a.toml",
    "App.svelte",
    "Dockerfile",
    "Dockerfile.dev",
  ])
    expect(fileIcon(path)?.path.length).toBeGreaterThan(0);
  for (const path of ["LICENSE", "notes.txt", "unknown.xyz", "src.ts/README", ".gitignore"])
    expect(fileIcon(path)).toBeUndefined();
});
