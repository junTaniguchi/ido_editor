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

const serializeFlowchart = (model: MermaidGraphModel): MermaidSerializationResult => {
  const config = model.config.type === 'flowchart' ? model.config : diagramDefinitions.flowchart.defaultConfig;
  const lines: string[] = [`flowchart ${config.orientation}`];
  const warnings: string[] = [];

  model.nodes.forEach((node) => {
    const { variant, label } = node.data;
    const safeLabel = escapeMermaidText(label || node.id);

    let declaration = '';
    switch (variant) {
      case 'startEnd':
        declaration = `${node.id}(${safeLabel})`;
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
    lines.push(declaration);
  });

  model.edges.forEach((edge) => {
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
  });

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
    const alias = node.data.metadata?.alias?.trim();
    if (alias && alias !== node.id) {
      lines.push(`${keyword} ${alias} as ${escapeMermaidText(node.data.label)}`);
    } else {
      lines.push(`${keyword} ${node.id} as ${escapeMermaidText(node.data.label)}`);
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
