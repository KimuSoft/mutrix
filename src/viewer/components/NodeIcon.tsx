import {
  Braces,
  File,
  FileCode2,
  FileJson2,
  FileText,
  Folder,
  Hash,
  Image,
  Palette,
  Terminal,
  Package,
} from "lucide-react";
import type { ReportNode } from "../../shared/types";
import { fileIcon } from "../lib/file-icons";
export function NodeIcon({ node, size = 14 }: { node: ReportNode; size?: number }) {
  const brand = node.kind === "file" ? fileIcon(node.path) : undefined;
  if (brand)
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        data-file-icon={brand.slug}
        style={{ flexShrink: 0 }}
      >
        <path d={brand.path} />
      </svg>
    );
  let Icon = File;
  if (node.package) Icon = Package;
  else if (node.kind === "project") Icon = Folder;
  else if (node.kind === "folder") Icon = Folder;
  else if (node.kind === "scope") Icon = Braces;
  else if (node.kind === "residual") Icon = Hash;
  else if (/\.[cm]?[jt]sx?$/.test(node.path)) Icon = FileCode2;
  else if (/\.(json|jsonc|ya?ml|toml)$/.test(node.path)) Icon = FileJson2;
  else if (/\.(css|scss|sass|less)$/.test(node.path)) Icon = Palette;
  else if (/\.(md|txt|rst)$/.test(node.path)) Icon = FileText;
  else if (/\.(svg|png|jpg)$/.test(node.path)) Icon = Image;
  else if (/\.(sh|ps1|bat)$/.test(node.path)) Icon = Terminal;
  return (
    <Icon
      size={size}
      strokeWidth={1.65}
      aria-hidden="true"
      data-node-icon={node.package ? "package" : node.kind}
    />
  );
}
