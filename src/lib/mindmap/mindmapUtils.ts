export type MindmapLayout = 'LR' | 'RL' | 'TB' | 'BT';

export interface MindmapNode {
  id: string;
  label: string;
  children: MindmapNode[];
}

export interface ParsedMindmap {
  root: MindmapNode;
  layout: MindmapLayout;
}

const DEFAULT_LAYOUT: MindmapLayout = 'LR';
const DEFAULT_ROOT_LABEL = '中心テーマ';

let mindmapIdCounter = 0;
const createNodeId = () => {
  mindmapIdCounter += 1;
  return `mind_${Date.now().toString(36)}_${mindmapIdCounter.toString(36)}`;
};

export const createMindmapNode = (label: string): MindmapNode => ({
  id: createNodeId(),
  label,
  children: [],
});

const normalizeLabel = (value: string): string => {
  let input = value.trim();
  if (!input) return DEFAULT_ROOT_LABEL;

  const classIndex = input.indexOf(':::');
  if (classIndex >= 0) {
    input = input.slice(0, classIndex).trim();
  }

  const annotationIndex = input.indexOf('::');
  if (annotationIndex >= 0) {
    input = input.slice(0, annotationIndex).trim();
  }

  const pairedPatterns: Array<[RegExp, RegExp]> = [
    [/^\(\(/, /\)\)$/],
    [/^\(\s*/, /\s*\)$/],
    [/^\[\[/, /\]\]$/],
    [/^\[[^[\]]*/, /\]$/],
    [/^"/, /"$/],
  ];
  for (const [start, end] of pairedPatterns) {
    if (start.test(input) && end.test(input)) {
      input = input.replace(start, '').replace(end, '').trim();
      break;
    }
  }

  return input || DEFAULT_ROOT_LABEL;
};

const countIndent = (line: string): number => {
  const spaces = line.match(/^\s*/)?.[0] ?? '';
  const normalized = spaces.replace(/\t/g, '  ');
  return Math.floor(normalized.length / 2);
};

export const parseMindmap = (source: string): ParsedMindmap => {
  const lines = source.split(/\r?\n/);
  let layout: MindmapLayout = DEFAULT_LAYOUT;
  let seenHeader = false;
  const stack: Array<{ depth: number; node: MindmapNode }> = [];
  let root: MindmapNode | null = null;

  lines.forEach((rawLine) => {
    const line = rawLine.replace(/\t/g, '  ');
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    if (trimmed.startsWith('%%')) {
      return;
    }
    if (!seenHeader) {
      const headerMatch = trimmed.match(/^mindmap\b(?:\s+([A-Za-z]{2}))?/i);
      if (headerMatch) {
        const candidate = headerMatch[1]?.toUpperCase() as MindmapLayout | undefined;
        if (candidate && ['LR', 'RL', 'TB', 'BT'].includes(candidate)) {
          layout = candidate;
        }
        seenHeader = true;
      }
      return;
    }

    const depth = countIndent(line);
    const label = normalizeLabel(trimmed);
    const node: MindmapNode = {
      id: createNodeId(),
      label,
      children: [],
    };

    if (!root) {
      root = node;
      stack.length = 0;
      stack.push({ depth, node });
      return;
    }

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    const parent = stack.length > 0 ? stack[stack.length - 1].node : root;
    parent.children = [...parent.children, node];
    stack.push({ depth, node });
  });

  if (!root) {
    root = createMindmapNode(DEFAULT_ROOT_LABEL);
  }

  return { root, layout };
};

export const serializeMindmap = (root: MindmapNode, layout: MindmapLayout): string => {
  const lines: string[] = [];
  const header = layout && layout !== DEFAULT_LAYOUT ? `mindmap ${layout}` : 'mindmap';
  lines.push(header);

  const walk = (node: MindmapNode, depth: number) => {
    const indent = '  '.repeat(depth);
    lines.push(`${indent}${node.label}`);
    node.children.forEach((child) => walk(child, depth + 1));
  };

  walk(root, 1);
  return lines.join('\n');
};

export const generateMarkdownFromMindmap = (root: MindmapNode): string => {
  const lines: string[] = [];
  const traverse = (node: MindmapNode, depth: number) => {
    if (depth === 0) {
      lines.push(`# ${node.label}`);
    } else {
      const indent = '  '.repeat(Math.max(0, depth - 1));
      lines.push(`${indent}- ${node.label}`);
    }
    node.children.forEach((child) => traverse(child, depth + 1));
  };
  traverse(root, 0);
  return lines.join('\n');
};

export const findMindmapNode = (root: MindmapNode, id: string): MindmapNode | null => {
  if (root.id === id) {
    return root;
  }
  for (const child of root.children) {
    const found = findMindmapNode(child, id);
    if (found) {
      return found;
    }
  }
  return null;
};

export const updateMindmapNodeLabel = (root: MindmapNode, id: string, label: string): MindmapNode => {
  if (root.id === id) {
    return { ...root, label };
  }
  const nextChildren = root.children.map((child) => updateMindmapNodeLabel(child, id, label));
  return root.children === nextChildren ? root : { ...root, children: nextChildren };
};

export const addMindmapChild = (
  root: MindmapNode,
  parentId: string,
  child: MindmapNode,
): { tree: MindmapNode; added: boolean } => {
  if (root.id === parentId) {
    return {
      tree: { ...root, children: [...root.children, child] },
      added: true,
    };
  }
  let added = false;
  const nextChildren = root.children.map((node) => {
    if (added) {
      return node;
    }
    const result = addMindmapChild(node, parentId, child);
    if (result.added) {
      added = true;
      return result.tree;
    }
    return result.tree;
  });
  return {
    tree: added ? { ...root, children: nextChildren } : root,
    added,
  };
};

export const addMindmapSibling = (
  root: MindmapNode,
  targetId: string,
  sibling: MindmapNode,
): { tree: MindmapNode; added: boolean } => {
  const index = root.children.findIndex((child) => child.id === targetId);
  if (index >= 0) {
    const nextChildren = [...root.children];
    nextChildren.splice(index + 1, 0, sibling);
    return {
      tree: { ...root, children: nextChildren },
      added: true,
    };
  }
  let added = false;
  const nextChildren = root.children.map((child) => {
    if (added) return child;
    const result = addMindmapSibling(child, targetId, sibling);
    if (result.added) {
      added = true;
      return result.tree;
    }
    return result.tree;
  });
  return {
    tree: added ? { ...root, children: nextChildren } : root,
    added,
  };
};

export const removeMindmapNode = (
  root: MindmapNode,
  targetId: string,
): { tree: MindmapNode; removed: boolean; parentId: string | null } => {
  let removed = false;
  let removedParentId: string | null = null;

  const nextChildren = root.children
    .map((child) => {
      if (child.id === targetId) {
        removed = true;
        removedParentId = root.id;
        return null;
      }
      const result = removeMindmapNode(child, targetId);
      if (result.removed) {
        removed = true;
        removedParentId = result.parentId ?? removedParentId;
      }
      return result.tree;
    })
    .filter((child): child is MindmapNode => Boolean(child));

  if (removed) {
    return { tree: { ...root, children: nextChildren }, removed: true, parentId: removedParentId };
  }

  return { tree: root, removed: false, parentId: null };
};

export const moveMindmapNode = (
  root: MindmapNode,
  targetId: string,
  direction: 'up' | 'down',
): { tree: MindmapNode; moved: boolean } => {
  const index = root.children.findIndex((child) => child.id === targetId);
  if (index >= 0) {
    if (direction === 'up' && index === 0) {
      return { tree: root, moved: false };
    }
    if (direction === 'down' && index === root.children.length - 1) {
      return { tree: root, moved: false };
    }
    const nextChildren = [...root.children];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    const temp = nextChildren[swapIndex];
    nextChildren[swapIndex] = nextChildren[index];
    nextChildren[index] = temp;
    return { tree: { ...root, children: nextChildren }, moved: true };
  }

  let moved = false;
  const nextChildren = root.children.map((child) => {
    if (moved) {
      return child;
    }
    const result = moveMindmapNode(child, targetId, direction);
    if (result.moved) {
      moved = true;
      return result.tree;
    }
    return result.tree;
  });

  return {
    tree: moved ? { ...root, children: nextChildren } : root,
    moved,
  };
};

export const getMindmapNodeContext = (
  root: MindmapNode,
  targetId: string,
): { node: MindmapNode; parent: MindmapNode | null; index: number } | null => {
  if (root.id === targetId) {
    return { node: root, parent: null, index: -1 };
  }

  for (let index = 0; index < root.children.length; index += 1) {
    const child = root.children[index];
    if (child.id === targetId) {
      return { node: child, parent: root, index };
    }
    const nested = getMindmapNodeContext(child, targetId);
    if (nested) {
      return nested;
    }
  }

  return null;
};

export const getMindmapNodePath = (root: MindmapNode, targetId: string): MindmapNode[] => {
  const traverse = (node: MindmapNode, path: MindmapNode[]): MindmapNode[] | null => {
    const nextPath = [...path, node];
    if (node.id === targetId) {
      return nextPath;
    }

    for (const child of node.children) {
      const found = traverse(child, nextPath);
      if (found) {
        return found;
      }
    }

    return null;
  };

  return traverse(root, []) ?? [root];
};

export const ensureMindmapRoot = (node: MindmapNode | null | undefined): MindmapNode => {
  if (!node) {
    return createMindmapNode(DEFAULT_ROOT_LABEL);
  }
  if (!node.label || node.label.trim().length === 0) {
    return { ...node, label: DEFAULT_ROOT_LABEL };
  }
  return node;
};

export const DEFAULT_MINDMAP_LAYOUT = DEFAULT_LAYOUT;
export const DEFAULT_MINDMAP_ROOT_LABEL = DEFAULT_ROOT_LABEL;
