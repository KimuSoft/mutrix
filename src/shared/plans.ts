import type { Diagnostic, Report, ReportNode, SummaryDocument, SummaryEntry } from "./types";

/** Derive a forecast from the current snapshot, never from the Git comparison baseline. */
export function projectPlan(report: Report, doc: SummaryDocument) {
  const diagnostics: Diagnostic[] = [];
  const warn = (message: string) => diagnostics.push({ level: "warning", message });
  const nodes = new Map<string, ReportNode>();
  for (const original of report.nodes) {
    if (original.status === "deleted" && original.id !== report.rootId) continue;
    nodes.set(original.id, {
      ...original,
      children: [...original.children],
      beforeLoc: original.afterLoc,
      added: 0,
      removed: 0,
      delta: 0,
      status: "unchanged",
      weight: original.afterLoc,
      beforeRange: original.afterRange,
      documentation: {
        before: original.documentation?.after,
        after: original.documentation?.after,
      },
      signature: { before: original.signature?.after, after: original.signature?.after },
      package: original.package?.after
        ? { before: original.package.after, after: original.package.after }
        : undefined,
      summary: undefined,
      rename: undefined,
      plan: {},
    });
  }
  for (const node of nodes.values()) node.children = node.children.filter((id) => nodes.has(id));
  const paths = new Set(
    [...nodes.values()]
      .filter((node) => node.kind === "file" || node.kind === "folder")
      .map((node) => node.path),
  );
  const entries = new Map<string, SummaryEntry>();
  for (const entry of doc.entries) {
    if (entries.has(entry.nodeId)) warn(`Duplicate plan ID skipped: ${entry.nodeId}`);
    else entries.set(entry.nodeId, entry);
  }
  const pending = [...entries.values()].filter((entry) => entry.create);
  // Resolve new parents before their children, independent of document order.
  while (pending.length) {
    let progressed = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const entry = pending[i];
      const spec = entry.create!;
      const parent = nodes.get(spec.parentId);
      if (!parent) continue;
      pending.splice(i, 1);
      progressed = true;
      const validParent =
        spec.kind === "scope"
          ? parent.kind === "file" || parent.kind === "scope"
          : parent.kind === "project" || parent.kind === "folder";
      const expectedPath =
        spec.kind === "scope" ? parent.path : [parent.path, spec.name].filter(Boolean).join("/");
      if (
        nodes.has(entry.nodeId) ||
        !validParent ||
        spec.path !== expectedPath ||
        (spec.kind !== "scope" && paths.has(spec.path))
      ) {
        warn(`Invalid new plan node: ${entry.nodeId}`);
        entries.delete(entry.nodeId);
        continue;
      }
      const node: ReportNode = {
        id: entry.nodeId,
        parentId: parent.id,
        kind: spec.kind,
        name: spec.name,
        path: spec.path,
        beforeLoc: 0,
        afterLoc: 0,
        delta: 0,
        added: 0,
        removed: 0,
        weight: 0,
        status: "added",
        children: [],
        plan: { virtual: true },
      };
      nodes.set(node.id, node);
      if (spec.kind !== "scope") paths.add(spec.path);
      if (!parent.children.length && parent.beforeLoc > 0) {
        let residualId = `plan-residual:${parent.id}`;
        while (nodes.has(residualId) || entries.has(residualId)) residualId += "~";
        nodes.set(residualId, {
          ...parent,
          id: residualId,
          parentId: parent.id,
          kind: "residual",
          name: "기존 코드",
          children: [],
          summary: undefined,
          documentation: undefined,
          signature: undefined,
          package: undefined,
          beforeRange: undefined,
          afterRange: undefined,
        });
        parent.children.push(residualId);
      }
      parent.children.push(node.id);
    }
    if (!progressed) {
      for (const entry of pending) warn(`Missing or cyclic plan parent: ${entry.nodeId}`);
      break;
    }
  }
  const estimates = new Set<string>();
  let budget = nodes.get(report.rootId)!.beforeLoc;
  // Validate all estimates before applying any; overlapping targets are ambiguous.
  for (const entry of entries.values()) {
    const node = nodes.get(entry.nodeId);
    if (!node) {
      if (!entry.create) warn(`Unknown plan ID: ${entry.nodeId}`);
      continue;
    }
    node.summary = entry.summary;
    if (entry.plan?.signature) {
      if (node.kind !== "scope" || (!node.plan?.virtual && !node.signature?.after)) {
        warn(`Function contract requires a function scope: ${node.id}`);
      } else {
        const { parameters, returnType } = entry.plan.signature;
        node.signature = {
          before: node.signature?.before,
          after: {
            parameters: parameters.map((parameter) => ({
              ...parameter,
              optional: !!parameter.optional,
              rest: !!parameter.rest,
            })),
            returnType,
          },
        };
        node.plan = { ...node.plan, proposedSignature: true };
      }
    }
    const delta = entry.plan?.delta;
    if (delta === undefined) continue;
    if (node.beforeLoc + delta < 0 || !Number.isSafeInteger(budget + Math.max(0, delta))) {
      warn(`Invalid plan LOC estimate: ${entry.nodeId}`);
      continue;
    }
    estimates.add(node.id);
    budget += Math.max(0, delta);
  }
  const conflicts = new Set<string>();
  for (const node of nodes.values()) {
    let parent = node.parentId ? nodes.get(node.parentId) : undefined;
    while (parent) {
      if (estimates.has(parent.id) && entries.has(node.id)) {
        conflicts.add(parent.id);
      }
      parent = parent.parentId ? nodes.get(parent.parentId) : undefined;
    }
  }
  for (const id of conflicts) {
    estimates.delete(id);
    warn(`Overlapping plan estimate skipped; use child estimates instead: ${id}`);
  }
  const result: ReportNode[] = [];
  const visit = (id: string): ReportNode | undefined => {
    const node = nodes.get(id);
    if (!node) return;
    const delta = estimates.has(id) ? entries.get(id)!.plan!.delta : undefined;
    if (delta !== undefined) {
      // Whole-node estimates do not invent a distribution among existing scopes.
      node.children = [];
      node.added = Math.max(0, delta);
      node.removed = Math.max(0, -delta);
      node.afterLoc = node.beforeLoc + delta;
      node.weight = Math.max(node.beforeLoc, node.afterLoc);
      node.plan = { ...node.plan!, estimated: true };
    } else {
      const children = node.children.map(visit).filter((child): child is ReportNode => !!child);
      node.children = children.map((child) => child.id);
      if (children.length) {
        for (const key of ["beforeLoc", "afterLoc", "added", "removed", "weight"] as const)
          node[key] = children.reduce((sum, child) => sum + child[key], 0);
        node.plan = { ...node.plan!, estimated: children.some((child) => child.plan?.estimated) };
      }
    }
    node.delta = node.afterLoc - node.beforeLoc;
    const changed =
      node.added + node.removed ||
      node.summary?.trim() ||
      node.plan?.proposedSignature ||
      node.children.some((id) => nodes.get(id)?.status !== "unchanged");
    node.status = node.plan?.virtual ? "added" : changed ? "modified" : "unchanged";
    result.push(node);
    return node;
  };
  visit(report.rootId);
  return { nodes: result, diagnostics };
}
