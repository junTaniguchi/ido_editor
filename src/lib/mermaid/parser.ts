import { diagramDefinitions } from './diagramDefinitions';
import type {
  MermaidDiagramConfig,
  MermaidDiagramType,
  MermaidEdge,
  MermaidGraphModel,
  MermaidNode,
  MermaidNodeData,
} from './types';

const createPosition = (index: number): { x: number; y: number } => {
  const column = index % 4;
  const row = Math.floor(index / 4);
  return { x: column * 220, y: row * 140 };
};

const cloneConfig = <T extends MermaidDiagramConfig>(config: T): T => ({ ...config });

const createBaseModel = (type: MermaidDiagramType): MermaidGraphModel => {
  const definition = diagramDefinitions[type];
  return {
    type,
    config: cloneConfig(definition.defaultConfig) as MermaidDiagramConfig,
    nodes: [],
    edges: [],
    warnings: [],
    subgraphs: [],
  };
};

let generatedIdCounter = 0;
const generateFallbackId = (): string => {
  generatedIdCounter += 1;
  return `node_${generatedIdCounter.toString(36)}`;
};

const sanitizeId = (id: string): string => {
  const normalized = id.normalize('NFKC').trim();
  if (!normalized) {
    return generateFallbackId();
  }
  const sanitized = normalized.replace(/[^\p{L}\p{N}_-]/gu, '_');
  return sanitized.length > 0 ? sanitized : generateFallbackId();
};
const sanitizeLabel = (value: string): string => value.replace(/^"|"$/g, '').trim();

type MutableMetadata = Record<string, string | string[]> & {
  subgraphIds?: string[];
  subgraphId?: string;
};

const extractSubgraphIds = (metadata?: MutableMetadata): string[] => {
  if (!metadata) return [];
  const rawIds = metadata.subgraphIds;
  if (Array.isArray(rawIds)) {
    return Array.from(new Set(rawIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)));
  }
  const legacyId = metadata.subgraphId;
  if (typeof legacyId === 'string' && legacyId.trim()) {
    return [legacyId.trim()];
  }
  return [];
};

const applySubgraphIds = (metadata: MutableMetadata, subgraphIds: string[]): MutableMetadata => {
  const normalized = Array.from(new Set(subgraphIds.filter((id) => id && id.trim().length > 0)));
  if (normalized.length > 0) {
    metadata.subgraphIds = normalized;
  } else {
    delete metadata.subgraphIds;
  }
  if ('subgraphId' in metadata) {
    delete metadata.subgraphId;
  }
  return metadata;
};

const appendSubgraphId = (node: MermaidNode, subgraphId: string) => {
  if (!subgraphId) return;
  const metadata = { ...(node.data.metadata || {}) } as MutableMetadata;
  const current = extractSubgraphIds(metadata);
  if (!current.includes(subgraphId)) {
    current.push(subgraphId);
  }
  node.data.metadata = applySubgraphIds(metadata, current);
};

export const detectDiagramType = (source: string): MermaidDiagramType => {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith('%%'));
  if (lines.length === 0) {
    return 'flowchart';
  }
  const firstLine = lines[0].toLowerCase();
  if (firstLine.startsWith('flowchart') || firstLine.startsWith('graph')) return 'flowchart';
  if (firstLine.startsWith('sequencediagram')) return 'sequence';
  if (firstLine.startsWith('classdiagram')) return 'class';
  if (firstLine.startsWith('statediagram')) return 'state';
  if (firstLine.startsWith('erdiagram')) return 'er';
  if (firstLine.startsWith('gantt')) return 'gantt';
  if (firstLine.startsWith('pie')) return 'pie';
  if (firstLine.startsWith('gitgraph')) return 'gitGraph';
  return 'flowchart';
};

const ensureNode = (
  model: MermaidGraphModel,
  id: string,
  variant: string,
  label: string,
  metadata?: Record<string, string | string[]>,
): MermaidNode => {
  const existing = model.nodes.find((node) => node.id === id);
  if (existing) {
    if (label && existing.data.label === existing.id) {
      existing.data.label = label;
    }
    if (metadata) {
      existing.data.metadata = { ...(existing.data.metadata || {}), ...metadata } as Record<string, string | string[]>;
    }
    return existing;
  }

  const node: MermaidNode = {
    id,
    type: 'mermaid-node',
    position: createPosition(model.nodes.length),
    data: {
      diagramType: model.type,
      variant,
      label: label || id,
      metadata: metadata ? ({ ...metadata } as Record<string, string | string[]>) : {},
    },
  };
  model.nodes.push(node);
  return node;
};

const addEdge = (
  model: MermaidGraphModel,
  source: string,
  target: string,
  variant: string,
  label?: string,
  metadata?: Record<string, string | string[]>,
): void => {
  const edgeId = `edge_${model.edges.length}_${source}_${target}`;
  const edge: MermaidEdge = {
    id: edgeId,
    source,
    target,
    data: {
      diagramType: model.type,
      variant,
      label,
      metadata: metadata ? { ...metadata } : {},
    },
  };
  model.edges.push(edge);
};

const parseFlowchart = (source: string): MermaidGraphModel => {
  const model = createBaseModel('flowchart');
  const lines = source.split(/\r?\n/);
  const orientationPattern = /^(?:flowchart|graph)\s+([A-Za-z]{2})/i;
  const nodePatterns: { variant: string; regex: RegExp }[] = [
    { variant: 'subroutine', regex: /([\p{L}\p{N}_-]+)\s*\[\[([^\]]+)\]\]/gu },
    { variant: 'process', regex: /([\p{L}\p{N}_-]+)\s*\[([^\]]+)\]/gu },
    { variant: 'decision', regex: /([\p{L}\p{N}_-]+)\s*\{([^}]+)\}/gu },
    { variant: 'startEnd', regex: /([\p{L}\p{N}_-]+)\s*\(\(([^)]+)\)\)/gu },
    { variant: 'startEnd', regex: /([\p{L}\p{N}_-]+)\s*\(([^)]+)\)/gu },
    { variant: 'inputOutput', regex: /([\p{L}\p{N}_-]+)\s*\[\/([^/]+)\/\]/gu },
  ];
  const edgePattern = /([\p{L}\p{N}_-]+)\s*((?=[-\.=>ox]*[-\.=>])[-\.=>ox]+)\s*(?:\|([^|]+)\|)?\s*([\p{L}\p{N}_-]+)/gu;

  const subgraphMap = new Map<string, { title: string; nodes: Set<string> }>();
  const pendingMultiSubgraphs = new Map<string, string[]>();
  let currentSubgraphId: string | null = null;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed.startsWith('%%')) {
      const multiMatch = trimmed.match(/^%%\s*ido:subgraphs\s+([^=\s]+)\s*=\s*(.+)$/i);
      if (multiMatch) {
        const nodeId = sanitizeId(multiMatch[1]);
        const ids = multiMatch[2]
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
          .map((item) => sanitizeId(item))
          .filter((id) => id.length > 0);
        if (ids.length > 0) {
          pendingMultiSubgraphs.set(nodeId, ids);
        }
      }
      return;
    }
    const orientationMatch = trimmed.match(orientationPattern);
    if (orientationMatch) {
      model.config = { type: 'flowchart', orientation: orientationMatch[1].toUpperCase() as any };
      return;
    }

    if (trimmed.toLowerCase() === 'end') {
      currentSubgraphId = null;
      return;
    }

    const subgraphMatch = trimmed.match(/^subgraph\s+(\S+)(?:\s*\[(.+)\])?/i);
    if (subgraphMatch) {
      const id = sanitizeId(subgraphMatch[1]);
      const title = subgraphMatch[2] ? sanitizeLabel(subgraphMatch[2]) : '';
      subgraphMap.set(id, { title, nodes: new Set<string>() });
      currentSubgraphId = id;
      return;
    }

    const styleMatch = trimmed.match(/^style\s+([^\s]+)\s+(.+)$/i);
    if (styleMatch) {
      const nodeId = sanitizeId(styleMatch[1]);
      const styleParts = styleMatch[2]
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      const node = model.nodes.find((item) => item.id === nodeId);
      if (node) {
        const metadata = { ...(node.data.metadata || {}) };
        styleParts.forEach((part) => {
          const [key, value] = part.split(':');
          if (!key || !value) return;
          const trimmedKey = key.trim().toLowerCase();
          const trimmedValue = value.trim();
          if (!trimmedValue) return;
          if (trimmedKey === 'fill') metadata.fillColor = trimmedValue;
          if (trimmedKey === 'stroke') metadata.strokeColor = trimmedValue;
          if (trimmedKey === 'color') metadata.textColor = trimmedValue;
        });
        node.data.metadata = metadata;
      }
      return;
    }

    const linkStyleMatch = trimmed.match(/^linkStyle\s+(\d+)\s+(.+)$/i);
    if (linkStyleMatch) {
      const index = Number.parseInt(linkStyleMatch[1], 10);
      if (!Number.isNaN(index) && model.edges[index]) {
        const styleParts = linkStyleMatch[2]
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean);
        const edge = model.edges[index];
        const metadata = { ...(edge.data.metadata || {}) };
        styleParts.forEach((part) => {
          const [key, value] = part.split(':');
          if (!key || !value) return;
          const trimmedKey = key.trim().toLowerCase();
          const trimmedValue = value.trim();
          if (!trimmedValue) return;
          if (trimmedKey === 'stroke') metadata.strokeColor = trimmedValue;
          if (trimmedKey === 'color') metadata.textColor = trimmedValue;
          if (trimmedKey === 'fill') metadata.fillColor = trimmedValue;
        });
        edge.data.metadata = metadata;
      }
      return;
    }

    const matchedNodeIds = new Set<string>();

    nodePatterns.forEach(({ variant, regex }) => {
      let match: RegExpExecArray | null;
      regex.lastIndex = 0;
      while ((match = regex.exec(trimmed)) !== null) {
        const id = sanitizeId(match[1]);
        if (matchedNodeIds.has(id)) {
          continue;
        }
        matchedNodeIds.add(id);
        const label = sanitizeLabel(match[2]);
        const node = ensureNode(model, id, variant, label);
        if (currentSubgraphId) {
          const entry = subgraphMap.get(currentSubgraphId);
          entry?.nodes.add(node.id);
          appendSubgraphId(node, currentSubgraphId);
        }
      }
    });

    let match: RegExpExecArray | null;
    edgePattern.lastIndex = 0;
    while ((match = edgePattern.exec(trimmed)) !== null) {
      const source = sanitizeId(match[1]);
      const symbol = match[2];
      const label = match[3] ? sanitizeLabel(match[3]) : undefined;
      const target = sanitizeId(match[4]);

      const sourceNode = ensureNode(model, source, 'process', source);
      const targetNode = ensureNode(model, target, 'process', target);
      if (currentSubgraphId) {
        const entry = subgraphMap.get(currentSubgraphId);
        entry?.nodes.add(sourceNode.id);
        entry?.nodes.add(targetNode.id);
        appendSubgraphId(sourceNode, currentSubgraphId);
        appendSubgraphId(targetNode, currentSubgraphId);
      }

      let variant = 'arrow';
      if (symbol.includes('.')) {
        variant = 'dashed';
      } else if (symbol.includes('=')) {
        variant = 'thick';
      }

      addEdge(model, source, target, variant, label);
    }
  });

  if (pendingMultiSubgraphs.size > 0) {
    pendingMultiSubgraphs.forEach((ids, nodeId) => {
      const node = model.nodes.find((item) => item.id === nodeId);
      if (!node) return;
      const metadata = { ...(node.data.metadata || {}) } as MutableMetadata;
      applySubgraphIds(metadata, ids);
      node.data.metadata = metadata;
      ids.forEach((id) => {
        const entry = subgraphMap.get(id);
        if (entry) {
          entry.nodes.add(nodeId);
        }
      });
    });
  }

  if (subgraphMap.size > 0) {
    model.subgraphs = Array.from(subgraphMap.entries()).map(([id, value]) => ({
      id,
      title: value.title,
      nodes: Array.from(value.nodes),
    }));
  }

  return model;
};

const parseSequence = (source: string): MermaidGraphModel => {
  const model = createBaseModel('sequence');
  const lines = source.split(/\r?\n/);
  const config = model.config.type === 'sequence' ? model.config : { type: 'sequence', autoNumber: false };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) return;
    if (trimmed.toLowerCase() === 'autonumber') {
      config.autoNumber = true;
      return;
    }
    const participantMatch = trimmed.match(/^(participant|actor|boundary|control|database)\s+([^\s]+)(?:\s+as\s+(.+))?/i);
    if (participantMatch) {
      const variant = participantMatch[1].toLowerCase();
      const alias = sanitizeId(participantMatch[2]);
      const label = participantMatch[3] ? sanitizeLabel(participantMatch[3]) : alias;
      ensureNode(model, alias, variant, label, { alias });
      return;
    }
    const messageMatch = trimmed.match(/^([\p{L}\p{N}_-]+?)\s*((?:[-.]*>>|[-.]*>))\s*([\p{L}\p{N}_-]+)(?:\s*:\s*(.+))?/u);
    if (messageMatch) {
      const source = sanitizeId(messageMatch[1]);
      const arrow = messageMatch[2];
      const target = sanitizeId(messageMatch[3]);
      const label = messageMatch[4] ? sanitizeLabel(messageMatch[4]) : undefined;

      ensureNode(model, source, 'participant', source);
      ensureNode(model, target, 'participant', target);

      let variant: string = 'solid';
      if (arrow.includes('--')) {
        variant = 'dashed';
      } else if (arrow.endsWith('>') && !arrow.endsWith('>>')) {
        variant = 'open';
      }

      addEdge(model, source, target, variant, label);
    }
  });

  model.config = config;
  return model;
};

const parseClass = (source: string): MermaidGraphModel => {
  const model = createBaseModel('class');
  const lines = source.split(/\r?\n/);
  const directionPattern = /^direction\s+(TB|LR)/i;
  const relationshipPattern = /([\p{L}\p{N}_-]+)\s+([<:o*]{0,2}[-.]+[>:o*]{0,2})\s+([\p{L}\p{N}_-]+)(?:\s*:\s*(.+))?/gu;

  let buffer = '';
  let inClass = false;
  let currentClass = '';
  const classBody: string[] = [];

const flushClass = () => {
    if (!currentClass) return;
    const stereotype = classBody.find((line) => line.startsWith('<<') && line.endsWith('>>')) || undefined;
    const members = classBody
      .filter((line) => line && line !== stereotype && !line.trim().includes('('))
      .map((item) => item.trim())
      .filter(Boolean);
    const methods = classBody
      .filter((line) => line && line !== stereotype && line.trim().includes('('))
      .map((item) => item.trim())
      .filter(Boolean);
    let variant: string = 'class';
    if (stereotype) {
      if (stereotype.toLowerCase().includes('interface')) {
        variant = 'interface';
      } else if (stereotype.toLowerCase().includes('abstract')) {
        variant = 'abstract';
      }
    }
    const metadata: Record<string, string> = {};
    if (stereotype) metadata.stereotype = stereotype;
    if (members.length > 0) metadata.members = members.join('\n');
    if (methods.length > 0) metadata.methods = methods.join('\n');
    ensureNode(model, currentClass, variant, currentClass, metadata);
    classBody.length = 0;
    currentClass = '';
    inClass = false;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) return;
    const directionMatch = trimmed.match(directionPattern);
    if (directionMatch) {
      model.config = { type: 'class', direction: directionMatch[1] as any };
      return;
    }

    if (trimmed.startsWith('class ') && trimmed.includes('{')) {
      inClass = true;
      currentClass = sanitizeId(trimmed.split(' ')[1]);
      const bodyStart = trimmed.indexOf('{');
      buffer = trimmed.slice(bodyStart + 1);
      if (buffer.includes('}')) {
        const [content] = buffer.split('}');
        content.split('\n').forEach((lineContent) => classBody.push(lineContent.trim()));
        flushClass();
      }
      return;
    }

    if (inClass) {
      if (trimmed === '}') {
        flushClass();
        return;
      }
      classBody.push(trimmed);
      return;
    }

    let match: RegExpExecArray | null;
    relationshipPattern.lastIndex = 0;
    while ((match = relationshipPattern.exec(trimmed)) !== null) {
      const left = sanitizeId(match[1]);
      const symbol = match[2];
      const right = sanitizeId(match[3]);
      const label = match[4] ? sanitizeLabel(match[4]) : undefined;

      ensureNode(model, left, 'class', left);
      ensureNode(model, right, 'class', right);

      let variant: string = 'association';
      if (symbol.includes('<|')) variant = 'inheritance';
      else if (symbol.includes('*')) variant = 'composition';
      else if (symbol.includes('o')) variant = 'aggregation';
      else if (symbol.includes('.')) variant = 'dependency';

      addEdge(model, left, right, variant, label);
    }
  });

  flushClass();
  return model;
};

const parseState = (source: string): MermaidGraphModel => {
  const model = createBaseModel('state');
  const lines = source.split(/\r?\n/);
  const directionPattern = /^direction\s+(TB|LR)/i;
  const aliasPattern = /^state\s+"(.+?)"\s+as\s+([\p{L}\p{N}_-]+)/iu;
  const choicePattern = /^state\s+([\p{L}\p{N}_-]+)\s+<<choice>>/iu;
  const transitionPattern = /([\p{L}\p{N}_\[\]\*-]+)\s*-->\s*([\p{L}\p{N}_\[\]\*-]+)(?:\s*:\s*(.+))?/gu;

  const resolveStateId = (raw: string, role: 'source' | 'target'): { id: string; variant: 'start' | 'end' | 'state' } => {
    const normalized = raw.replace(/\s+/g, '');
    if (normalized === '[*]') {
      if (role === 'source') {
        return { id: 'state_start', variant: 'start' };
      }
      return { id: 'state_end', variant: 'end' };
    }
    return { id: sanitizeId(normalized), variant: 'state' };
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) return;
    const directionMatch = trimmed.match(directionPattern);
    if (directionMatch) {
      model.config = { type: 'state', direction: directionMatch[1] as any };
      return;
    }
    const aliasMatch = trimmed.match(aliasPattern);
    if (aliasMatch) {
      const label = sanitizeLabel(aliasMatch[1]);
      const id = sanitizeId(aliasMatch[2]);
      ensureNode(model, id, 'state', label);
      return;
    }
    const choiceMatch = trimmed.match(choicePattern);
    if (choiceMatch) {
      const id = sanitizeId(choiceMatch[1]);
      ensureNode(model, id, 'choice', id);
      return;
    }

    let match: RegExpExecArray | null;
    transitionPattern.lastIndex = 0;
    while ((match = transitionPattern.exec(trimmed)) !== null) {
      const sourceRaw = match[1];
      const targetRaw = match[2];
      const label = match[3] ? sanitizeLabel(match[3]) : undefined;
      const sourceInfo = resolveStateId(sourceRaw, 'source');
      const targetInfo = resolveStateId(targetRaw, 'target');

      ensureNode(model, sourceInfo.id, sourceInfo.variant, sourceInfo.variant === 'start' ? 'Start' : sourceInfo.id);
      ensureNode(model, targetInfo.id, targetInfo.variant, targetInfo.variant === 'end' ? 'End' : targetInfo.id);

      addEdge(model, sourceInfo.id, targetInfo.id, 'transition', label);
    }
  });

  return model;
};

const parseEr = (source: string): MermaidGraphModel => {
  const model = createBaseModel('er');
  const lines = source.split(/\r?\n/);
  let currentEntity: string | null = null;
  const attributes: string[] = [];

  const flush = () => {
    if (!currentEntity) return;
    ensureNode(model, currentEntity, 'entity', currentEntity, {
      attributes: attributes.join('\n'),
    });
    attributes.length = 0;
    currentEntity = null;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) return;
    if (trimmed.endsWith('{')) {
      flush();
      currentEntity = sanitizeId(trimmed.replace('{', '').trim());
      return;
    }
    if (trimmed === '}') {
      flush();
      return;
    }
    const relMatch = trimmed.match(/([\p{L}\p{N}_-]+)\s+([|}o]{1,2}[-]{2}[|{o]{1,2})\s+([\p{L}\p{N}_-]+)(?:\s*:\s*(.+))?/u);
    if (relMatch) {
      flush();
      const left = sanitizeId(relMatch[1]);
      const symbol = relMatch[2];
      const right = sanitizeId(relMatch[3]);
      const label = relMatch[4] ? sanitizeLabel(relMatch[4]) : undefined;

      ensureNode(model, left, 'entity', left);
      ensureNode(model, right, 'entity', right);

      let variant = 'identifying';
      if (symbol === '||--o{') variant = 'nonIdentifying';
      else if (symbol === '||--|{') variant = 'oneToMany';
      else if (symbol === '}o--o{') variant = 'manyToMany';

      addEdge(model, left, right, variant, label);
      return;
    }
    if (currentEntity) {
      attributes.push(trimmed);
    }
  });

  flush();
  return model;
};

const parseGantt = (source: string): MermaidGraphModel => {
  const model = createBaseModel('gantt');
  const lines = source.split(/\r?\n/);
  const config = model.config.type === 'gantt' ? model.config : diagramDefinitions.gantt.defaultConfig;
  let currentSection = 'General';

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) return;
    if (trimmed.toLowerCase().startsWith('title ')) {
      config.title = trimmed.slice(6).trim();
      return;
    }
    if (trimmed.toLowerCase().startsWith('dateformat')) {
      config.dateFormat = trimmed.split(' ')[1] || config.dateFormat;
      return;
    }
    if (trimmed.toLowerCase().startsWith('axisformat')) {
      config.axisFormat = trimmed.split(' ')[1] || config.axisFormat;
      return;
    }
    if (trimmed.toLowerCase().startsWith('section ')) {
      currentSection = trimmed.slice('section '.length).trim();
      return;
    }

    const taskMatch = trimmed.match(/^([^:]+):(.+)$/);
    if (taskMatch) {
      const label = sanitizeLabel(taskMatch[1].trim());
      const rest = taskMatch[2].split(',').map((token) => token.trim()).filter(Boolean);
      let status = 'active';
      let taskId = '';
      const metadata: Record<string, string> = { section: currentSection };
      const knownStatus = new Set(['done', 'active', 'crit', 'milestone']);

      if (rest.length > 0 && knownStatus.has(rest[0] as any)) {
        status = rest.shift() as string;
      }

      if (rest.length > 0) {
        const candidate = rest[0];
        const looksLikeStartOrDuration = /^(after\s+\S+|\d{4}-\d{2}-\d{2}|\d+\s*[dwmy])$/i.test(candidate);
        if (!looksLikeStartOrDuration) {
          taskId = sanitizeId(rest.shift() as string);
        }
      }

      if (rest.length > 0) {
        metadata.start = rest.shift() as string;
      }

      if (rest.length > 0) {
        const value = rest.shift() as string;
        if (/^\d+[dwmy]$/i.test(value)) {
          metadata.duration = value;
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          metadata.end = value;
        } else if (/^after\s+/i.test(value)) {
          if (!metadata.start) {
            metadata.start = value;
          } else {
            metadata.dependsOn = value;
          }
        } else {
          metadata.duration = value;
        }
      }

      if (rest.length > 0) {
        metadata.dependsOn = rest.shift() as string;
      }

      metadata.status = status;
      const resolvedId = taskId || sanitizeId(label);
      metadata.taskId = resolvedId;

      ensureNode(model, resolvedId, status === 'milestone' ? 'milestone' : 'task', label, metadata);
    }
  });

  model.config = config;
  return model;
};

const parseGitGraph = (source: string): MermaidGraphModel => {
  const model = createBaseModel('gitGraph');
  const lines = source.split(/\r?\n/);
  const config =
    model.config.type === 'gitGraph'
      ? { ...model.config }
      : { type: 'gitGraph', orientation: 'LR' as const };

  let commandIndex = 0;
  let skippingOptions = false;
  let braceDepth = 0;

  const createCommandNode = (
    variant: string,
    label: string,
    metadata: Record<string, string> = {},
  ): MermaidNode => {
    const index = commandIndex;
    const nodeId = `git_${index.toString(36).padStart(4, '0')}`;
    const baseMetadata: Record<string, string> = { ...metadata };
    if (!baseMetadata.sequence) {
      baseMetadata.sequence = index.toString();
    }
    const normalizedLabel = label.trim().length > 0 ? label.trim() : variant;
    const node: MermaidNode = {
      id: nodeId,
      type: 'mermaid-node',
      position: { x: 160, y: index * 100 },
      data: {
        diagramType: 'gitGraph',
        variant,
        label: normalizedLabel,
        metadata: baseMetadata,
      },
    };
    model.nodes.push(node);
    commandIndex += 1;
    return node;
  };

  const parseAttributes = (input: string): { attributes: Record<string, string>; remainder: string } => {
    const attributes: Record<string, string> = {};
    const attributePattern = /([A-Za-z_-]+)\s*:\s*(?:"([^"]*)"|([^\s]+))/g;
    let match: RegExpExecArray | null;
    while ((match = attributePattern.exec(input)) !== null) {
      const key = match[1];
      const value = (match[2] ?? match[3] ?? '').trim();
      attributes[key] = value;
    }
    const remainder = input
      .replace(/([A-Za-z_-]+)\s*:\s*(?:"([^"]*)"|([^\s]+))/g, ' ')
      .replace(/,\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { attributes, remainder };
  };

  interface BranchState {
    key: string;
    name: string;
    node: MermaidNode;
  }

  interface BranchEnsureResult {
    state: BranchState;
    created: boolean;
  }

  interface PendingCheckout {
    sourceCommitId?: string;
    targetBranchId: string;
    metadata?: Record<string, string>;
  }

  const branchStates = new Map<string, BranchState>();
  const lastCommitByBranch = new Map<string, string>();
  let currentBranch: BranchState | null = null;
  const DEFAULT_BRANCH_ID = '__default__';
  let pendingCheckout: PendingCheckout | null = null;

  const getBranchKey = (name: string) => name.trim().toLowerCase();

  const ensureBranch = (name: string, metadata: Record<string, string> = {}): BranchEnsureResult => {
    const key = getBranchKey(name);
    const existing = branchStates.get(key);
    if (existing) {
      if (metadata.order) {
        const currentMetadata = existing.node.data.metadata || {};
        if (currentMetadata.order !== metadata.order) {
          existing.node.data.metadata = { ...currentMetadata, order: metadata.order };
        }
      }
      return { state: existing, created: false };
    }
    const node = createCommandNode('branch', name, metadata);
    const state: BranchState = { key, name, node };
    branchStates.set(key, state);
    return { state, created: true };
  };

  const findBranch = (name: string): BranchState | null => {
    const key = getBranchKey(name);
    return branchStates.get(key) ?? null;
  };

  const setPendingCheckout = (
    targetBranchId: string,
    sourceCommitId?: string,
    metadata?: Record<string, string>,
  ) => {
    if (!sourceCommitId) {
      pendingCheckout = null;
      return;
    }
    const normalizedMetadata = metadata
      ? Object.fromEntries(
          Object.entries(metadata).filter(([, value]) => typeof value === 'string' && value.trim().length > 0),
        )
      : undefined;
    pendingCheckout = {
      targetBranchId,
      sourceCommitId,
      metadata: normalizedMetadata && Object.keys(normalizedMetadata).length > 0 ? normalizedMetadata : undefined,
    };
  };

  const applyPendingCheckout = (branchId: string, commitNode: MermaidNode) => {
    if (!pendingCheckout) return;
    if (pendingCheckout.targetBranchId !== branchId) return;
    if (pendingCheckout.sourceCommitId) {
      addEdge(
        model,
        pendingCheckout.sourceCommitId,
        commitNode.id,
        'gitCheckout',
        undefined,
        pendingCheckout.metadata,
      );
    }
    pendingCheckout = null;
  };

  const recordCommit = (branchId: string, commitNode: MermaidNode, branchName?: string) => {
    const existingMetadata = (commitNode.data.metadata || {}) as Record<string, string>;
    const normalizedBranchId = branchId === DEFAULT_BRANCH_ID ? 'main' : branchId;
    if (existingMetadata.branchId !== normalizedBranchId) {
      commitNode.data.metadata = { ...existingMetadata, branchId: normalizedBranchId };
    } else if (commitNode.data.metadata !== existingMetadata) {
      commitNode.data.metadata = existingMetadata;
    }
    const parentCommitId = lastCommitByBranch.get(branchId);
    if (parentCommitId) {
      addEdge(
        model,
        parentCommitId,
        commitNode.id,
        'gitCommit',
        undefined,
        branchName ? { branch: branchName } : undefined,
      );
    }
    applyPendingCheckout(branchId, commitNode);
    lastCommitByBranch.set(branchId, commitNode.id);
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) {
      return;
    }

    if (skippingOptions) {
      const openCount = (trimmed.match(/\{/g) ?? []).length;
      const closeCount = (trimmed.match(/\}/g) ?? []).length;
      braceDepth += openCount;
      braceDepth -= closeCount;
      if (braceDepth <= 0 && trimmed.includes('}')) {
        skippingOptions = false;
        braceDepth = 0;
      }
      return;
    }

    if (/^options\b/i.test(trimmed)) {
      skippingOptions = true;
      const openCount = (trimmed.match(/\{/g) ?? []).length;
      const closeCount = (trimmed.match(/\}/g) ?? []).length;
      braceDepth = openCount - closeCount;
      if (braceDepth <= 0 && trimmed.includes('}')) {
        skippingOptions = false;
        braceDepth = 0;
      }
      return;
    }

    const headerMatch = trimmed.match(/^gitgraph\b(?:\s+([A-Za-z]{2}))?\s*:?\s*$/i);
    if (headerMatch) {
      const orientation = headerMatch[1] ? headerMatch[1].toUpperCase() : undefined;
      if (orientation === 'LR' || orientation === 'TB' || orientation === 'BT') {
        config.orientation = orientation;
      }
      return;
    }

    const commandMatch = trimmed.match(/^(commit|branch|checkout|switch|merge|cherry-pick)\b(.*)$/i);
    if (!commandMatch) {
      model.warnings.push(`解釈できない行をスキップしました: ${trimmed}`);
      return;
    }

    const keyword = commandMatch[1].toLowerCase();
    const rest = commandMatch[2]?.trim() ?? '';
    const { attributes, remainder } = parseAttributes(rest);

    if (keyword === 'commit') {
      const metadata: Record<string, string> = {};
      if (attributes.id) {
        metadata.id = attributes.id;
      }
      if (attributes.tag) {
        metadata.tag = attributes.tag;
      }
      const typeValue = (attributes.type ?? '').toUpperCase();
      metadata.type = typeValue || 'NORMAL';
      const fallbackLabel = remainder ? sanitizeLabel(remainder) : '';
      const label = metadata.id || fallbackLabel || `commit_${commandIndex + 1}`;
      const commitNode = createCommandNode('commit', label, metadata);
      const branchId = currentBranch ? currentBranch.node.id : DEFAULT_BRANCH_ID;
      recordCommit(branchId, commitNode, currentBranch?.name);
      return;
    }

    if (keyword === 'branch') {
      const branchNameRaw = remainder || attributes.name;
      const branchName = branchNameRaw ? sanitizeLabel(branchNameRaw) : '';
      if (!branchName) {
        model.warnings.push(`branch コマンドのブランチ名が見つからないためスキップしました: ${trimmed}`);
        return;
      }
      const metadata: Record<string, string> = {};
      if (attributes.order) {
        metadata.order = attributes.order;
      }
      const fromBranch = currentBranch;
      const { state: branch, created } = ensureBranch(branchName, metadata);
      const inheritedFromBranch = fromBranch ? lastCommitByBranch.get(fromBranch.node.id) : undefined;
      const inheritedFromDefault = !fromBranch ? lastCommitByBranch.get(DEFAULT_BRANCH_ID) : undefined;
      const inheritedCommitId = inheritedFromBranch ?? inheritedFromDefault;
      if (inheritedFromBranch) {
        lastCommitByBranch.set(branch.node.id, inheritedFromBranch);
      } else if (inheritedFromDefault && !lastCommitByBranch.has(branch.node.id)) {
        lastCommitByBranch.set(branch.node.id, inheritedFromDefault);
      }
      if (created && inheritedCommitId) {
        addEdge(
          model,
          inheritedCommitId,
          branch.node.id,
          'gitBranchCreate',
          undefined,
          {
            from: fromBranch?.name ?? 'main',
            to: branch.name,
            branchId: branch.node.id,
          },
        );
      }
      setPendingCheckout(branch.node.id, inheritedCommitId, {
        from: fromBranch?.name ?? '',
        to: branch.name,
      });
      currentBranch = branch;
      return;
    }

    if (keyword === 'checkout' || keyword === 'switch') {
      const branchNameRaw = remainder || attributes.name;
      const branchName = branchNameRaw ? sanitizeLabel(branchNameRaw) : '';
      if (!branchName) {
        model.warnings.push(`checkout コマンドのブランチ名が見つからないためスキップしました: ${trimmed}`);
        return;
      }
      const metadata: Record<string, string> = {};
      if (keyword === 'switch') {
        metadata.command = 'switch';
      }
      const checkoutNode = createCommandNode('checkout', branchName, metadata);
      const previousBranch = currentBranch;
      const targetBranch = findBranch(branchName);
      const fromBranchId = previousBranch ? previousBranch.node.id : DEFAULT_BRANCH_ID;
      const sourceCommitId = lastCommitByBranch.get(fromBranchId);
      if (targetBranch) {
        addEdge(
          model,
          targetBranch.node.id,
          checkoutNode.id,
          'gitCheckout',
          undefined,
          {
            branchId: targetBranch.node.id,
            from: previousBranch?.name ?? '',
            to: targetBranch.name,
          },
        );
      } else if (sourceCommitId) {
        addEdge(
          model,
          sourceCommitId,
          checkoutNode.id,
          'gitCheckout',
          undefined,
          {
            from: previousBranch?.name ?? '',
            to: branchName,
          },
        );
      }
      if (targetBranch) {
        setPendingCheckout(targetBranch.node.id, sourceCommitId, {
          from: previousBranch?.name ?? '',
          to: targetBranch.name,
        });
        currentBranch = targetBranch;
      } else {
        pendingCheckout = null;
        currentBranch = null;
      }
      return;
    }

    if (keyword === 'merge') {
      const branchNameRaw = remainder || attributes.branch;
      const branchName = branchNameRaw ? sanitizeLabel(branchNameRaw) : '';
      if (!branchName) {
        model.warnings.push(`merge コマンドのブランチ名が見つからないためスキップしました: ${trimmed}`);
        return;
      }
      const metadata: Record<string, string> = {};
      if (attributes.id) {
        metadata.id = attributes.id;
      }
      if (attributes.tag) {
        metadata.tag = attributes.tag;
      }
      const typeValue = (attributes.type ?? '').toUpperCase();
      metadata.type = typeValue || 'NORMAL';
      const mergeNode = createCommandNode('merge', branchName, metadata);
      const sourceBranch = findBranch(branchName);
      const sourceCommitId = sourceBranch ? lastCommitByBranch.get(sourceBranch.node.id) : undefined;
      const currentBranchId = currentBranch ? currentBranch.node.id : DEFAULT_BRANCH_ID;
      const currentCommitId = lastCommitByBranch.get(currentBranchId);
      if (sourceBranch && sourceCommitId) {
        addEdge(
          model,
          sourceCommitId,
          mergeNode.id,
          'gitMerge',
          undefined,
          {
            from: sourceBranch.name,
            to: currentBranch?.name ?? 'main',
            branchId: sourceBranch.node.id,
          },
        );
      }
      if (currentCommitId && currentCommitId !== sourceCommitId) {
        addEdge(
          model,
          currentCommitId,
          mergeNode.id,
          'gitMerge',
          undefined,
          {
            from: currentBranch?.name ?? 'main',
            to: branchName,
          },
        );
      }
      return;
    }

    if (keyword === 'cherry-pick') {
      if (!attributes.id) {
        model.warnings.push(`cherry-pick コマンドに id が無いためスキップしました: ${trimmed}`);
        return;
      }
      const metadata: Record<string, string> = { id: attributes.id, command: 'cherry-pick' };
      if (attributes.parent) {
        metadata.parent = attributes.parent;
      }
      createCommandNode('cherryPick', attributes.id, metadata);
      return;
    }
  });

  model.config = config;
  return model;
};



const parsePie = (source: string): MermaidGraphModel => {
  const model = createBaseModel('pie');
  const lines = source.split(/\r?\n/);
  const config = model.config.type === 'pie' ? { ...model.config } : { type: 'pie', showData: false };
  let sliceIndex = 0;

  const ensureUniqueId = (baseLabel: string): string => {
    const sanitizedBase = sanitizeId(baseLabel || `slice_${sliceIndex}`);
    let candidate = sanitizedBase;
    let counter = 1;
    while (model.nodes.some((node) => node.id === candidate)) {
      candidate = `${sanitizedBase}_${(counter++).toString(36)}`;
    }
    return candidate;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) return;

    if (/^pie\b/i.test(trimmed)) {
      let rest = trimmed.replace(/^pie\b/i, '').trim();
      if (rest) {
        if (/\bshowdata\b/i.test(rest)) {
          config.showData = true;
          rest = rest.replace(/\bshowdata\b/i, '').trim();
        }
        const titleMatch = rest.match(/title\s+(.+)/i);
        if (titleMatch) {
          config.title = sanitizeLabel(titleMatch[1]);
        }
      }
      return;
    }

    if (/^showdata\b/i.test(trimmed)) {
      config.showData = true;
      return;
    }

    if (/^title\b/i.test(trimmed)) {
      const titleText = trimmed.slice(5).trim();
      if (titleText) {
        config.title = sanitizeLabel(titleText);
      }
      return;
    }

    const sliceMatch = trimmed.match(/^"(.+?)"\s*:\s*([+-]?\d+(?:\.\d+)?)$/);
    const fallbackMatch = sliceMatch || trimmed.match(/^([^:]+)\s*:\s*([+-]?\d+(?:\.\d+)?)$/);
    if (fallbackMatch) {
      const label = sanitizeLabel(fallbackMatch[1]);
      const value = fallbackMatch[2];
      const id = ensureUniqueId(label || `slice_${sliceIndex}`);
      sliceIndex += 1;
      ensureNode(model, id, 'slice', label || id, { value });
      return;
    }

    model.warnings.push(`解釈できない行をスキップしました: ${trimmed}`);
  });

  model.config = config;
  return model;
};

export const parseMermaidSource = (source: string): MermaidGraphModel => {
  generatedIdCounter = 0;
  const trimmed = source.trim();
  if (!trimmed) {
    return createBaseModel('flowchart');
  }
  const type = detectDiagramType(trimmed);
  switch (type) {
    case 'flowchart':
      return parseFlowchart(trimmed);
    case 'sequence':
      return parseSequence(trimmed);
    case 'class':
      return parseClass(trimmed);
    case 'state':
      return parseState(trimmed);
    case 'er':
      return parseEr(trimmed);
    case 'gantt':
      return parseGantt(trimmed);
    case 'gitGraph':
      return parseGitGraph(trimmed);
    case 'pie':
      return parsePie(trimmed);
    default:
      return parseFlowchart(trimmed);
  }
};
