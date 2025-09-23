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
  };
};

const sanitizeId = (id: string): string => id.replace(/[^A-Za-z0-9_]/g, '_');
const sanitizeLabel = (value: string): string => value.replace(/^"|"$/g, '').trim();

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
  return 'flowchart';
};

const ensureNode = (model: MermaidGraphModel, id: string, variant: string, label: string, metadata?: Record<string, string>): MermaidNode => {
  const existing = model.nodes.find((node) => node.id === id);
  if (existing) {
    if (label && existing.data.label === existing.id) {
      existing.data.label = label;
    }
    if (metadata) {
      existing.data.metadata = { ...(existing.data.metadata || {}), ...metadata };
    }
    return existing;
  }

  const node: MermaidNode = {
    id,
    type: 'default',
    position: createPosition(model.nodes.length),
    data: {
      diagramType: model.type,
      variant,
      label: label || id,
      metadata: metadata ? { ...metadata } : {},
    },
  };
  model.nodes.push(node);
  return node;
};

const addEdge = (model: MermaidGraphModel, source: string, target: string, variant: string, label?: string, metadata?: Record<string, string>): void => {
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
    { variant: 'subroutine', regex: /([A-Za-z0-9_]+)\s*\[\[([^\]]+)\]\]/g },
    { variant: 'process', regex: /([A-Za-z0-9_]+)\s*\[([^\]]+)\]/g },
    { variant: 'decision', regex: /([A-Za-z0-9_]+)\s*\{([^}]+)\}/g },
    { variant: 'startEnd', regex: /([A-Za-z0-9_]+)\s*\(\(([^)]+)\)\)/g },
    { variant: 'startEnd', regex: /([A-Za-z0-9_]+)\s*\(([^)]+)\)/g },
    { variant: 'inputOutput', regex: /([A-Za-z0-9_]+)\s*\[\/([^/]+)\/\]/g },
  ];
  const edgePattern = /([A-Za-z0-9_]+)\s*([-\.=>ox]+)\s*(?:\|([^|]+)\|)?\s*([A-Za-z0-9_]+)/g;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) return;
    const orientationMatch = trimmed.match(orientationPattern);
    if (orientationMatch) {
      model.config = { type: 'flowchart', orientation: orientationMatch[1].toUpperCase() as any };
      return;
    }
    if (trimmed.startsWith('subgraph') || trimmed === 'end') {
      return;
    }

    nodePatterns.forEach(({ variant, regex }) => {
      let match: RegExpExecArray | null;
      regex.lastIndex = 0;
      while ((match = regex.exec(trimmed)) !== null) {
        const id = sanitizeId(match[1]);
        const label = sanitizeLabel(match[2]);
        ensureNode(model, id, variant, label);
      }
    });

    let match: RegExpExecArray | null;
    edgePattern.lastIndex = 0;
    while ((match = edgePattern.exec(trimmed)) !== null) {
      const source = sanitizeId(match[1]);
      const symbol = match[2];
      const label = match[3] ? sanitizeLabel(match[3]) : undefined;
      const target = sanitizeId(match[4]);

      ensureNode(model, source, 'process', source);
      ensureNode(model, target, 'process', target);

      let variant = 'arrow';
      if (symbol.includes('.')) {
        variant = 'dashed';
      } else if (symbol.includes('=')) {
        variant = 'thick';
      }

      addEdge(model, source, target, variant, label);
    }
  });

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
    const messageMatch = trimmed.match(/^([A-Za-z0-9_]+)\s*([-.]*>>|[-.]*>)\s*([A-Za-z0-9_]+)(?:\s*:\s*(.+))?/);
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
  const relationshipPattern = /([A-Za-z0-9_]+)\s+([<:o*]{0,2}[-.]+[>:o*]{0,2})\s+([A-Za-z0-9_]+)(?:\s*:\s*(.+))?/g;

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
  const aliasPattern = /^state\s+"(.+?)"\s+as\s+([A-Za-z0-9_]+)/i;
  const choicePattern = /^state\s+([A-Za-z0-9_]+)\s+<<choice>>/i;
  const transitionPattern = /([A-Za-z0-9_\[\]*]+)\s*-->\s*([A-Za-z0-9_\[\]*]+)(?:\s*:\s*(.+))?/g;

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
    const relMatch = trimmed.match(/([A-Za-z0-9_]+)\s+([|}o]{1,2}[-]{2}[|{o]{1,2})\s+([A-Za-z0-9_]+)(?:\s*:\s*(.+))?/);
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

export const parseMermaidSource = (source: string): MermaidGraphModel => {
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
    default:
      return parseFlowchart(trimmed);
  }
};
