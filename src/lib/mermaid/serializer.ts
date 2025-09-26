import { diagramDefinitions } from './diagramDefinitions';
import type {
  MermaidDiagramConfig,
  MermaidEdge,
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

  const orderMap = new Map<string, number>();
  model.nodes.forEach((node, index) => {
    orderMap.set(node.id, index);
  });

  const parseSequenceValue = (node: MermaidNode): number | undefined => {
    const raw = node.data.metadata?.sequence;
    if (!raw) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };

  const sortedNodes = [...model.nodes].sort((a, b) => {
    const seqA = parseSequenceValue(a);
    const seqB = parseSequenceValue(b);
    if (seqA !== undefined && seqB !== undefined) {
      if (seqA !== seqB) {
        return seqA - seqB;
      }
    } else if (seqA !== undefined) {
      return -1;
    } else if (seqB !== undefined) {
      return 1;
    }
    return (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0);
  });

  const formatIdentifier = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) {
      return trimmed;
    }
    return /\s/.test(trimmed) ? `"${escapeMermaidText(trimmed)}"` : trimmed;
  };

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
