import { diagramDefinitions } from './diagramDefinitions';
import type {
  MermaidDiagramConfig,
  MermaidEdge,
  MermaidGitBranch,
  MermaidGraphModel,
  MermaidNode,
  MermaidNodeData,
} from './types';

export interface MermaidSerializationResult {
  code: string;
  warnings: string[];
}

const escapeMermaidText = (value: string): string => value.replace(/"/g, '\\"');
const sanitizeMultiline = (value: string): string => value.split(/\r?\n/).map((line) => line.trim()).join('\n');
const getEdgeLabel = (edge: MermaidEdge): string => edge.data.label ?? edge.data.metadata?.label ?? '';

const sanitizeColor = (value?: string): string | undefined => {
  if (!value) return undefined;
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    return `#${value
      .slice(1)
      .split('')
      .map((char) => char + char)
      .join('')}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toLowerCase();
  }
  return value;
};

const buildStyleParts = (metadata?: Record<string, string | string[] | undefined>): string[] => {
  if (!metadata) return [];
  const parts: string[] = [];
  const rawFill = metadata.fillColor;
  const rawStroke = metadata.strokeColor;
  const rawText = metadata.textColor;
  const fill = sanitizeColor(Array.isArray(rawFill) ? rawFill[0] : rawFill);
  const stroke = sanitizeColor(Array.isArray(rawStroke) ? rawStroke[0] : rawStroke);
  const text = sanitizeColor(Array.isArray(rawText) ? rawText[0] : rawText);
  if (fill) parts.push(`fill:${fill}`);
  if (stroke) parts.push(`stroke:${stroke}`);
  if (text) parts.push(`color:${text}`);
  return parts;
};

type NodeMetadata = Record<string, string | string[]> & {
  subgraphIds?: string[];
  subgraphId?: string;
};

const extractSubgraphIds = (metadata?: NodeMetadata): string[] => {
  if (!metadata) return [];
  if (Array.isArray(metadata.subgraphIds)) {
    return Array.from(new Set(metadata.subgraphIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)));
  }
  const legacy = metadata.subgraphId;
  if (typeof legacy === 'string' && legacy.trim()) {
    return [legacy.trim()];
  }
  return [];
};

const serializeFlowchart = (model: MermaidGraphModel): MermaidSerializationResult => {
  const config = model.config.type === 'flowchart' ? model.config : diagramDefinitions.flowchart.defaultConfig;
  const lines: string[] = [`flowchart ${config.orientation}`];
  const warnings: string[] = [];

  const nodeMap = new Map<string, MermaidNode>(model.nodes.map((node) => [node.id, node]));
  const declaredNodes = new Set<string>();
  const styleLines: string[] = [];

  const emitNodeDeclaration = (node: MermaidNode, indent = '') => {
    const { variant, label } = node.data;
    const safeLabel = escapeMermaidText(label || node.id);

    let declaration = '';
    switch (variant) {
      case 'startEnd':
        declaration = `${node.id}((${safeLabel}))`;
        break;
      case 'decision':
        declaration = `${node.id}{${safeLabel}}`;
        break;
      case 'inputOutput':
        declaration = `${node.id}[/"${safeLabel}"/]`;
        break;
      case 'subroutine':
        declaration = `${node.id}[[${safeLabel}]]`;
        break;
      case 'process':
      default:
        declaration = `${node.id}[${safeLabel}]`;
        break;
    }
    lines.push(`${indent}${declaration}`.trimEnd());
    declaredNodes.add(node.id);

    const metadata = node.data.metadata || {};
    const styleParts = buildStyleParts(metadata);
    if (styleParts.length > 0) {
      styleLines.push(`style ${node.id} ${styleParts.join(',')}`);
    }
  };

  const subgraphs = model.subgraphs ?? [];
  subgraphs.forEach((subgraph) => {
    const title = subgraph.title ? ` [${escapeMermaidText(subgraph.title)}]` : '';
    const nodeIds = subgraph.nodes.filter((nodeId) => !declaredNodes.has(nodeId));
    if (nodeIds.length === 0) {
      return;
    }
    lines.push(`subgraph ${subgraph.id}${title}`);
    nodeIds.forEach((nodeId) => {
      const node = nodeMap.get(nodeId);
      if (!node) return;
      emitNodeDeclaration(node, '  ');
    });
    lines.push('end');
  });

  model.nodes.forEach((node) => {
    if (declaredNodes.has(node.id)) return;
    emitNodeDeclaration(node);
  });

  const edgeStyleLines: string[] = [];
  model.edges.forEach((edge, index) => {
    const { variant } = edge.data;
    let connector = '-->';
    if (variant === 'dashed') {
      connector = '-.->';
    } else if (variant === 'thick') {
      connector = '==>';
    }
    const label = getEdgeLabel(edge);
    const text = label ? `|${label}|` : '';
    lines.push(`${edge.source} ${connector}${text} ${edge.target}`.trim());

    const metadata = edge.data.metadata || {};
    const styleParts = buildStyleParts(metadata);
    if (styleParts.length > 0) {
      edgeStyleLines.push(`linkStyle ${index} ${styleParts.join(',')}`);
    }
  });

  const multiSubgraphLines: string[] = [];
  model.nodes.forEach((node) => {
    const ids = extractSubgraphIds(node.data.metadata as NodeMetadata | undefined);
    if (ids.length > 1) {
      multiSubgraphLines.push(`%% ido:subgraphs ${node.id}=${ids.join(',')}`);
    }
  });

  lines.push(...multiSubgraphLines);
  lines.push(...styleLines);
  lines.push(...edgeStyleLines);

  return { code: lines.join('\n'), warnings };
};

const sequenceVariantKeyword: Record<string, string> = {
  participant: 'participant',
  actor: 'actor',
  boundary: 'boundary',
  control: 'control',
  database: 'database',
};

const serializeSequence = (model: MermaidGraphModel): MermaidSerializationResult => {
  const config = model.config.type === 'sequence' ? model.config : diagramDefinitions.sequence.defaultConfig;
  const lines: string[] = ['sequenceDiagram'];
  const warnings: string[] = [];

  if (config.autoNumber) {
    lines.push('autonumber');
  }

  model.nodes.forEach((node) => {
    const keyword = sequenceVariantKeyword[node.data.variant] || 'participant';
    const alias = (node.data.metadata?.alias ?? node.id).trim() || node.id;
    const label = node.data.label?.trim() ?? '';

    if (label && label !== alias) {
      lines.push(`${keyword} ${alias} as ${escapeMermaidText(label)}`);
    } else {
      lines.push(`${keyword} ${alias}`);
    }
  });

  model.edges.forEach((edge) => {
    let connector = '->>';
    if (edge.data.variant === 'dashed') connector = '-->>';
    if (edge.data.variant === 'open') connector = '->';
    const label = getEdgeLabel(edge);
    const labelText = label ? `: ${label}` : '';
    lines.push(`${edge.source} ${connector} ${edge.target}${labelText}`);
  });

  return { code: lines.join('\n'), warnings };
};

const classRelationshipSymbols: Record<string, string> = {
  inheritance: '<|--',
  composition: '*--',
  aggregation: 'o--',
  association: '--',
  dependency: '..>'
};

const serializeClass = (model: MermaidGraphModel): MermaidSerializationResult => {
  const config = model.config.type === 'class' ? model.config : diagramDefinitions.class.defaultConfig;
  const lines: string[] = ['classDiagram'];
  const warnings: string[] = [];

  if (config.direction) {
    lines.push(`direction ${config.direction}`);
  }

  model.nodes.forEach((node) => {
    const metadata = node.data.metadata || {};
    const bodyLines: string[] = [];
    if (metadata.stereotype) {
      bodyLines.push(metadata.stereotype);
    }
    if (metadata.members) {
      bodyLines.push(...sanitizeMultiline(metadata.members).split('\n').filter(Boolean));
    }
    if (metadata.methods) {
      bodyLines.push(...sanitizeMultiline(metadata.methods).split('\n').filter(Boolean));
    }
    if (bodyLines.length > 0) {
      lines.push(`class ${node.id} {`);
      bodyLines.forEach((line) => lines.push(`  ${line}`));
      lines.push('}');
    } else {
      lines.push(`class ${node.id}`);
    }
    if (node.data.label && node.data.label !== node.id) {
      lines.push(`${node.id} : ${node.data.label}`);
    }
  });

  model.edges.forEach((edge) => {
    const symbol = classRelationshipSymbols[edge.data.variant] || '--';
    const label = getEdgeLabel(edge);
    const labelText = label ? ` : ${label}` : '';
    lines.push(`${edge.source} ${symbol} ${edge.target}${labelText}`);
  });

  return { code: lines.join('\n'), warnings };
};

const serializeState = (model: MermaidGraphModel): MermaidSerializationResult => {
  const config = model.config.type === 'state' ? model.config : diagramDefinitions.state.defaultConfig;
  const lines: string[] = ['stateDiagram-v2'];
  const warnings: string[] = [];

  if (config.direction) {
    lines.push(`direction ${config.direction}`);
  }

  const nodeMap = new Map<string, MermaidNodeData>();
  model.nodes.forEach((node) => {
    nodeMap.set(node.id, node.data);
    if (node.data.variant === 'state') {
      if (node.data.label && node.data.label !== node.id) {
        lines.push(`state "${escapeMermaidText(node.data.label)}" as ${node.id}`);
      } else {
        lines.push(`state ${node.id}`);
      }
    } else if (node.data.variant === 'choice') {
      lines.push(`state ${node.id} <<choice>>`);
    }
  });

  model.edges.forEach((edge) => {
    const sourceData = nodeMap.get(edge.source);
    const targetData = nodeMap.get(edge.target);
    const source = sourceData?.variant === 'start' ? '[*]' : sourceData?.variant === 'end' ? '[*]' : edge.source;
    const target = targetData?.variant === 'end' ? '[*]' : targetData?.variant === 'start' ? '[*]' : edge.target;
    const label = getEdgeLabel(edge);
    const labelText = label ? ` : ${label}` : '';
    lines.push(`${source} --> ${target}${labelText}`);
  });

  return { code: lines.join('\n'), warnings };
};

const erRelationshipSymbols: Record<string, string> = {
  identifying: '||--||',
  nonIdentifying: '||--o{',
  oneToMany: '||--|{',
  manyToMany: '}o--o{',
};

const serializeEr = (model: MermaidGraphModel): MermaidSerializationResult => {
  const lines: string[] = ['erDiagram'];
  const warnings: string[] = [];

  model.nodes.forEach((node) => {
    const metadata = node.data.metadata || {};
    const attrs = metadata.attributes ? sanitizeMultiline(metadata.attributes).split('\n').filter(Boolean) : [];
    if (attrs.length > 0) {
      lines.push(`${node.id} {`);
      attrs.forEach((attr) => lines.push(`  ${attr}`));
      lines.push('}');
    } else {
      lines.push(node.id);
    }
  });

  model.edges.forEach((edge) => {
    const symbol = erRelationshipSymbols[edge.data.variant] || '--';
    const label = getEdgeLabel(edge);
    const labelText = label ? ` : ${label}` : '';
    lines.push(`${edge.source} ${symbol} ${edge.target}${labelText}`);
  });

  return { code: lines.join('\n'), warnings };
};

const serializeGantt = (model: MermaidGraphModel): MermaidSerializationResult => {
  const config = model.config.type === 'gantt' ? model.config : diagramDefinitions.gantt.defaultConfig;
  const lines: string[] = ['gantt'];
  const warnings: string[] = [];

  if (config.title) {
    lines.push(`title ${config.title}`);
  }
  lines.push(`dateFormat ${config.dateFormat}`);
  lines.push(`axisFormat ${config.axisFormat}`);

  const sections = new Map<string, MermaidNode[]>();
  model.nodes.forEach((node) => {
    const section = node.data.metadata?.section || 'General';
    if (!sections.has(section)) {
      sections.set(section, []);
    }
    sections.get(section)!.push(node);
  });

  const knownStatuses = new Set(['done', 'active', 'crit', 'milestone']);

  sections.forEach((nodes, sectionName) => {
    lines.push(`section ${sectionName}`);
    nodes.forEach((node) => {
      const metadata = node.data.metadata || {};
      const status = metadata.status && knownStatuses.has(metadata.status) ? `${metadata.status}, ` : '';
      const taskId = metadata.taskId || node.id;
      const timingParts: string[] = [];
      if (metadata.start) {
        timingParts.push(metadata.start);
      }
      if (metadata.end) {
        timingParts.push(metadata.end);
      } else if (metadata.duration) {
        timingParts.push(metadata.duration);
      }
      if (metadata.dependsOn) {
        timingParts.push(metadata.dependsOn);
      }
      const timing = timingParts.length > 0 ? `, ${timingParts.join(', ')}` : '';
      lines.push(`${node.data.label} :${status}${taskId}${timing}`);
    });
  });

  return { code: lines.join('\n'), warnings };
};

const serializeGitGraph = (model: MermaidGraphModel): MermaidSerializationResult => {
  const config = model.config.type === 'gitGraph' ? model.config : diagramDefinitions.gitGraph.defaultConfig;
  const warnings: string[] = [];
  const orientation = config.orientation ?? 'LR';
  const lines: string[] = [`gitGraph ${orientation}:`];

  const formatIdentifier = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) {
      return trimmed;
    }
    return /\s/.test(trimmed) ? `"${escapeMermaidText(trimmed)}"` : trimmed;
  };

  const parseSequence = (value: string | undefined): number | undefined => {
    if (!value) return undefined;
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  };

  if (model.gitBranches && model.gitBranches.length > 0) {
    const branchMap = new Map<string, MermaidGitBranch>();
    model.gitBranches.forEach((branch) => {
      branchMap.set(branch.id, branch);
    });

    const nodeOrder = new Map<string, number>();
    model.nodes.forEach((node, index) => nodeOrder.set(node.id, index));
    const edgeOrder = new Map<string, number>();
    model.edges.forEach((edge, index) => edgeOrder.set(edge.id, index));

    const checkoutEdgesByTarget = new Map<string, MermaidEdge[]>();
    const mergeEdgesByTarget = new Map<string, MermaidEdge[]>();

    model.edges.forEach((edge) => {
      if (edge.data?.diagramType !== 'gitGraph') return;
      if (edge.data.variant === 'gitCheckout') {
        const list = checkoutEdgesByTarget.get(edge.target) ?? [];
        list.push(edge);
        checkoutEdgesByTarget.set(edge.target, list);
      }
      if (edge.data.variant === 'gitMerge') {
        const list = mergeEdgesByTarget.get(edge.target) ?? [];
        list.push(edge);
        mergeEdgesByTarget.set(edge.target, list);
      }
    });

    type GitEvent =
      | { kind: 'branch'; branch: MermaidGitBranch; sequence?: number; order: number }
      | { kind: 'checkout'; edge: MermaidEdge; sequence?: number; order: number }
      | { kind: 'commit'; node: MermaidNode; sequence?: number; order: number }
      | { kind: 'merge'; node: MermaidNode; sequence?: number; order: number }
      | { kind: 'cherryPick'; node: MermaidNode; sequence?: number; order: number };

    const events: GitEvent[] = [];

    model.gitBranches
      .filter((branch) => branch.sequence !== undefined)
      .forEach((branch, index) => {
        events.push({
          kind: 'branch',
          branch,
          sequence: parseSequence(branch.sequence),
          order: index,
        });
      });

    model.edges.forEach((edge) => {
      if (edge.data?.diagramType !== 'gitGraph') return;
      if (edge.data.variant === 'gitCheckout') {
        events.push({
          kind: 'checkout',
          edge,
          sequence: parseSequence(edge.data.metadata?.sequence as string | undefined),
          order: edgeOrder.get(edge.id) ?? 0,
        });
      }
    });

    model.nodes.forEach((node) => {
      if (node.data?.diagramType !== 'gitGraph') return;
      const sequence = parseSequence(node.data.metadata?.sequence as string | undefined);
      const base: { sequence?: number; order: number } = {
        sequence,
        order: nodeOrder.get(node.id) ?? 0,
      };
      if (node.data.variant === 'commit') {
        events.push({ kind: 'commit', node, ...base });
        return;
      }
      if (node.data.variant === 'merge') {
        events.push({ kind: 'merge', node, ...base });
        return;
      }
      if (node.data.variant === 'cherryPick') {
        events.push({ kind: 'cherryPick', node, ...base });
        return;
      }
      warnings.push(`未対応のGitノードをスキップしました: ${node.data.variant}`);
    });

    events.sort((a, b) => {
      const seqA = a.sequence;
      const seqB = b.sequence;
      if (seqA !== undefined && seqB !== undefined && seqA !== seqB) {
        return seqA - seqB;
      }
      if (seqA !== undefined && seqB === undefined) {
        return -1;
      }
      if (seqA === undefined && seqB !== undefined) {
        return 1;
      }
      return a.order - b.order;
    });

    const resolveBranchName = (branchId?: string, fallback?: string): string | undefined => {
      if (branchId) {
        const branch = branchMap.get(branchId);
        if (branch?.name?.trim()) {
          return branch.name.trim();
        }
      }
      return fallback?.trim() ? fallback.trim() : undefined;
    };

    let currentBranch: string | undefined;

    events.forEach((event) => {
      switch (event.kind) {
        case 'branch': {
          const name = event.branch.name?.trim();
          if (!name) {
            warnings.push('ブランチ名が空のため branch コマンドをスキップしました。');
            break;
          }
          const orderText = event.branch.order?.toString().trim();
          const extras = orderText ? ` order: ${orderText}` : '';
          lines.push(`  branch ${formatIdentifier(name)}${extras}`);
          currentBranch = name;
          break;
        }
        case 'checkout': {
          const metadata = (event.edge.data?.metadata || {}) as Record<string, string>;
          const branchName = resolveBranchName(metadata.toBranchId, metadata.toBranch);
          if (!branchName) {
            warnings.push('チェックアウト対象のブランチ名が見つからないためスキップしました。');
            break;
          }
          const command = metadata.command === 'switch' ? 'switch' : 'checkout';
          lines.push(`  ${command} ${formatIdentifier(branchName)}`);
          currentBranch = branchName;
          break;
        }
        case 'commit': {
          const metadata = (event.node.data.metadata || {}) as Record<string, string>;
          const branchName = resolveBranchName(metadata.branchId, metadata.branchName);
          if (!currentBranch && branchName) {
            currentBranch = branchName;
          }
          if (branchName && currentBranch && branchName !== currentBranch) {
            lines.push(`  checkout ${formatIdentifier(branchName)}`);
            currentBranch = branchName;
          }
          const parts: string[] = [];
          if (metadata.id?.trim()) {
            parts.push(`id: "${escapeMermaidText(metadata.id.trim())}"`);
          }
          if (metadata.tag?.trim()) {
            parts.push(`tag: "${escapeMermaidText(metadata.tag.trim())}"`);
          }
          const typeValue = (metadata.type ?? 'NORMAL').toUpperCase();
          if (typeValue && typeValue !== 'NORMAL') {
            parts.push(`type: ${typeValue}`);
          }
          const text = parts.length > 0 ? `  commit ${parts.join(' ')}` : '  commit';
          lines.push(text);
          break;
        }
        case 'merge': {
          const metadata = (event.node.data.metadata || {}) as Record<string, string>;
          const mergeBranchName = metadata.mergeBranch?.trim() ||
            (() => {
              const edges = mergeEdgesByTarget.get(event.node.id) ?? [];
              for (const edge of edges) {
                const branchId = edge.data?.metadata?.sourceBranchId as string | undefined;
                const fallbackName = edge.data?.metadata?.sourceBranch as string | undefined;
                const resolved = resolveBranchName(branchId, fallbackName);
                if (resolved) return resolved;
              }
              return undefined;
            })();
          if (!mergeBranchName) {
            warnings.push(`マージノード「${event.node.id}」のブランチ名が見つからないためスキップしました。`);
            break;
          }
          const branchName = resolveBranchName(metadata.branchId, metadata.branchName);
          if (!currentBranch && branchName) {
            currentBranch = branchName;
          }
          if (branchName && currentBranch && branchName !== currentBranch) {
            lines.push(`  checkout ${formatIdentifier(branchName)}`);
            currentBranch = branchName;
          }
          const parts: string[] = [];
          if (metadata.id?.trim()) {
            parts.push(`id: "${escapeMermaidText(metadata.id.trim())}"`);
          }
          if (metadata.tag?.trim()) {
            parts.push(`tag: "${escapeMermaidText(metadata.tag.trim())}"`);
          }
          const typeValue = (metadata.type ?? 'NORMAL').toUpperCase();
          if (typeValue && typeValue !== 'NORMAL') {
            parts.push(`type: ${typeValue}`);
          }
          const suffix = parts.length > 0 ? ` ${parts.join(' ')}` : '';
          lines.push(`  merge ${formatIdentifier(mergeBranchName)}${suffix}`);
          break;
        }
        case 'cherryPick': {
          const metadata = (event.node.data.metadata || {}) as Record<string, string>;
          const branchName = resolveBranchName(metadata.branchId, metadata.branchName);
          if (!currentBranch && branchName) {
            currentBranch = branchName;
          }
          if (branchName && currentBranch && branchName !== currentBranch) {
            lines.push(`  checkout ${formatIdentifier(branchName)}`);
            currentBranch = branchName;
          }
          const commitId = metadata.id?.trim();
          if (!commitId) {
            warnings.push(`cherry-pick ノード「${event.node.id}」に対象IDが無いためスキップしました。`);
            break;
          }
          const parts = [`id: "${escapeMermaidText(commitId)}"`];
          if (metadata.parent?.trim()) {
            parts.push(`parent: "${escapeMermaidText(metadata.parent.trim())}"`);
          }
          const command = metadata.command?.trim() || 'cherry-pick';
          lines.push(`  ${command} ${parts.join(' ')}`);
          break;
        }
        default:
          break;
      }
    });

    return { code: lines.join('\n'), warnings };
  }

  // Fallback for旧データ
  const orderMap = new Map<string, number>();
  model.nodes.forEach((node, index) => {
    orderMap.set(node.id, index);
  });

  const sortedNodes = [...model.nodes].sort((a, b) => {
    const seqA = parseSequence(a.data.metadata?.sequence as string | undefined);
    const seqB = parseSequence(b.data.metadata?.sequence as string | undefined);
    if (seqA !== undefined && seqB !== undefined && seqA !== seqB) {
      return seqA - seqB;
    }
    if (seqA !== undefined && seqB === undefined) {
      return -1;
    }
    if (seqA === undefined && seqB !== undefined) {
      return 1;
    }
    return (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0);
  });

  sortedNodes.forEach((node) => {
    switch (node.data.variant) {
      case 'commit': {
        const metadata = node.data.metadata || {};
        const parts: string[] = [];
        if (metadata.id?.trim()) {
          parts.push(`id: "${escapeMermaidText(metadata.id.trim())}"`);
        }
        if (metadata.tag?.trim()) {
          parts.push(`tag: "${escapeMermaidText(metadata.tag.trim())}"`);
        }
        const typeValue = (metadata.type ?? 'NORMAL').toUpperCase();
        if (typeValue && typeValue !== 'NORMAL') {
          parts.push(`type: ${typeValue}`);
        }
        const text = parts.length > 0 ? `  commit ${parts.join(' ')}` : '  commit';
        lines.push(text);
        break;
      }
      case 'branch': {
        const branchName = node.data.label?.trim() ?? '';
        if (!branchName) {
          warnings.push(`ブランチノード「${node.id}」に名称が無いため出力をスキップしました。`);
          break;
        }
        const metadata = node.data.metadata || {};
        const orderText = metadata.order?.toString().trim();
        const extras = orderText ? ` order: ${orderText}` : '';
        lines.push(`  branch ${formatIdentifier(branchName)}${extras}`);
        break;
      }
      case 'checkout': {
        const branchName = node.data.label?.trim() ?? '';
        if (!branchName) {
          warnings.push(`チェックアウトノード「${node.id}」にブランチ名が無いためスキップしました。`);
          break;
        }
        const command = node.data.metadata?.command === 'switch' ? 'switch' : 'checkout';
        lines.push(`  ${command} ${formatIdentifier(branchName)}`);
        break;
      }
      case 'merge': {
        const branchName = node.data.label?.trim() ?? '';
        if (!branchName) {
          warnings.push(`マージノード「${node.id}」にブランチ名が無いためスキップしました。`);
          break;
        }
        const metadata = node.data.metadata || {};
        const parts: string[] = [];
        if (metadata.id?.trim()) {
          parts.push(`id: "${escapeMermaidText(metadata.id.trim())}"`);
        }
        if (metadata.tag?.trim()) {
          parts.push(`tag: "${escapeMermaidText(metadata.tag.trim())}"`);
        }
        const typeValue = (metadata.type ?? 'NORMAL').toUpperCase();
        if (typeValue && typeValue !== 'NORMAL') {
          parts.push(`type: ${typeValue}`);
        }
        const suffix = parts.length > 0 ? ` ${parts.join(' ')}` : '';
        lines.push(`  merge ${formatIdentifier(branchName)}${suffix}`);
        break;
      }
      case 'cherryPick': {
        const metadata = node.data.metadata || {};
        const commitId = metadata.id?.trim();
        if (!commitId) {
          warnings.push(`cherry-pick ノード「${node.id}」に対象IDが無いためスキップしました。`);
          break;
        }
        const parts = [`id: "${escapeMermaidText(commitId)}"`];
        if (metadata.parent?.trim()) {
          parts.push(`parent: "${escapeMermaidText(metadata.parent.trim())}"`);
        }
        const command = metadata.command?.trim() || 'cherry-pick';
        lines.push(`  ${command} ${parts.join(' ')}`);
        break;
      }
      default: {
        warnings.push(`未対応のGitコマンドをスキップしました: ${node.data.variant}`);
        break;
      }
    }
  });

  return { code: lines.join('\n'), warnings };
};


const serializePie = (model: MermaidGraphModel): MermaidSerializationResult => {
  const config = model.config.type === 'pie' ? model.config : diagramDefinitions.pie.defaultConfig;
  const warnings: string[] = [];
  const headerParts: string[] = ['pie'];

  if (config.showData) {
    headerParts.push('showData');
  }
  if (config.title) {
    headerParts.push(`title ${config.title.trim()}`);
  }

  const lines: string[] = [headerParts.join(' ').trim() || 'pie'];

  model.nodes.forEach((node) => {
    const label = escapeMermaidText(node.data.label || node.id);
    const rawValue = (node.data.metadata?.value ?? '').toString().trim();
    if (!rawValue) {
      warnings.push(`スライス「${node.data.label || node.id}」の値が空のため0として出力します。`);
      lines.push(`  "${label}" : 0`);
      return;
    }

    if (Number.isNaN(Number(rawValue))) {
      warnings.push(`スライス「${node.data.label || node.id}」の値「${rawValue}」は数値として解釈できません。文字列のまま出力します。`);
      lines.push(`  "${label}" : ${rawValue}`);
    } else {
      lines.push(`  "${label}" : ${rawValue}`);
    }
  });

  return { code: lines.join('\n'), warnings };
};

export const serializeMermaid = (model: MermaidGraphModel): MermaidSerializationResult => {
  switch (model.type) {
    case 'flowchart':
      return serializeFlowchart(model);
    case 'sequence':
      return serializeSequence(model);
    case 'class':
      return serializeClass(model);
    case 'state':
      return serializeState(model);
    case 'er':
      return serializeEr(model);
    case 'gantt':
      return serializeGantt(model);
    case 'gitGraph':
      return serializeGitGraph(model);
    case 'pie':
      return serializePie(model);
    default:
      return { code: model.nodes.map((node) => node.data.label).join('\n'), warnings: ['未対応の図種類です'] };
  }
};

export const ensureConfig = (config: MermaidDiagramConfig): MermaidDiagramConfig => {
  if (!config) {
    return diagramDefinitions.flowchart.defaultConfig;
  }
  return config;
};
