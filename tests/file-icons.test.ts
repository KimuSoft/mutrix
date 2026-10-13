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

test("Rust source files share the Rust SVG path across case and path separators", () => {
  for (const path of ["src/lib.rs", "src/main.rs", "build.rs", "C:\\app\\Main.RS"])
    expect(fileIcon(path)?.slug).toBe("rust");
  expect(fileIcon("src/lib.rs")?.path.length).toBeGreaterThan(0);
  expect(fileIcon("Cargo.toml")?.slug).toBe("toml");
});

test("test.ts suffix takes priority over the TypeScript logo, using only the file name", () => {
  for (const path of ["tests/parser.test.ts", "C:\\app\\Parser.TEST.TS"])
    expect(fileIcon(path)?.slug).toBe("test");
  expect(fileIcon("parser.test.ts")?.stroke).toBe(true);
  for (const path of ["src/parser.ts", "src/types.d.ts", "parser.test.ts/utils.ts"])
    expect(fileIcon(path)?.slug).toBe("typescript");
});
