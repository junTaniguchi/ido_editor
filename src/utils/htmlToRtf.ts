type RenderState = {
  colorIndex: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  insidePre: boolean;
  listDepth: number;
};

type ColorEntry = {
  r: number;
  g: number;
  b: number;
};

interface RenderContext {
  view: Window;
  getColorIndex: (color: string | null | undefined) => number;
}

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'section',
  'article',
  'header',
  'footer',
  'blockquote',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'figure',
  'figcaption',
  'tr',
]);

const INLINE_IGNORED_TAGS = new Set(['style', 'script', 'noscript', 'template', 'meta']);

const LIST_TAGS = new Set(['ul', 'ol']);

const RTF_HEADER = '{\\rtf1\\ansi\\deff0';
const RTF_VIEW_KIND = '\\viewkind4\\uc1 ';
const RTF_PARAGRAPH = '\\pard ';

function parseColor(color: string | null | undefined): ColorEntry | null {
  if (!color) return null;
  const trimmed = color.trim();
  if (!trimmed || trimmed === 'transparent') {
    return null;
  }

  if (trimmed.startsWith('rgb')) {
    const match = trimmed.match(/rgba?\(([^)]+)\)/i);
    if (!match) return null;
    const parts = match[1]
      .split(/[\s,\/]+/)
      .map(part => part.trim())
      .filter(Boolean);
    if (parts.length < 3) {
      return null;
    }
    const [r, g, b] = parts;
    return {
      r: Number.parseInt(r, 10),
      g: Number.parseInt(g, 10),
      b: Number.parseInt(b, 10),
    };
  }

  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      const r = Number.parseInt(hex[0] + hex[0], 16);
      const g = Number.parseInt(hex[1] + hex[1], 16);
      const b = Number.parseInt(hex[2] + hex[2], 16);
      return { r, g, b };
    }
    if (hex.length === 6) {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      return { r, g, b };
    }
  }

  return null;
}

function collectColors(root: HTMLElement, view: Window) {
  const doc = root.ownerDocument;
  const colorMap = new Map<string, number>();
  const entries: ColorEntry[] = [];

  const ensureColor = (colorValue: string | null | undefined) => {
    const parsed = parseColor(colorValue);
    if (!parsed) return 0;
    const key = `${parsed.r},${parsed.g},${parsed.b}`;
    const existing = colorMap.get(key);
    if (existing) return existing;
    const index = entries.length + 1;
    entries.push(parsed);
    colorMap.set(key, index);
    return index;
  };

  ensureColor(view.getComputedStyle(root).color);

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  // Skip the root itself (already handled above).
  while (walker.nextNode()) {
    const current = walker.currentNode;
    if (current.nodeType === Node.TEXT_NODE) {
      const parent = current.parentElement;
      if (parent) {
        ensureColor(view.getComputedStyle(parent).color);
      }
    } else if (current.nodeType === Node.ELEMENT_NODE) {
      ensureColor(view.getComputedStyle(current as Element).color);
    }
  }

  if (entries.length === 0) {
    // Ensure at least one color (default to black).
    ensureColor('rgb(0,0,0)');
  }

  const colorTable = `{\\colortbl;${entries
    .map(entry => `\\red${entry.r}\\green${entry.g}\\blue${entry.b};`)
    .join('')}}`;

  const getColorIndex = (colorValue: string | null | undefined) => {
    const parsed = parseColor(colorValue);
    if (!parsed) return 0;
    const key = `${parsed.r},${parsed.g},${parsed.b}`;
    return colorMap.get(key) ?? 0;
  };

  const fallbackIndex = entries.length > 0 ? 1 : 0;
  const initialColorIndex = getColorIndex(view.getComputedStyle(root).color) || fallbackIndex;

  return { colorTable, getColorIndex, initialColorIndex, fallbackIndex };
}

function isBoldFont(weight: string | number): boolean {
  if (typeof weight === 'number') {
    return weight >= 600;
  }
  if (/^\d+$/.test(weight)) {
    return Number.parseInt(weight, 10) >= 600;
  }
  return weight === 'bold' || weight === 'bolder';
}

function hasUnderline(decoration: string | null | undefined): boolean {
  if (!decoration) return false;
  return decoration.split(/\s+/).includes('underline');
}

function escapeRtfText(text: string, state: RenderState): string {
  let result = '';
  let pendingSpace = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '\r') {
      continue;
    }

    if (char === '\n') {
      if (state.insidePre) {
        result += '\\line ';
      } else {
        result += ' ';
      }
      pendingSpace = false;
      continue;
    }

    if (char === '\t') {
      result += '\\tab ';
      pendingSpace = false;
      continue;
    }

    if (char.charCodeAt(0) === 160) {
      result += '\\~';
      pendingSpace = false;
      continue;
    }

    if (!state.insidePre && /\s/.test(char)) {
      if (!pendingSpace) {
        result += ' ';
        pendingSpace = true;
      }
      continue;
    }

    pendingSpace = false;

    if (char === '\\') {
      result += '\\\\';
      continue;
    }

    if (char === '{' || char === '}') {
      result += `\\${char}`;
      continue;
    }

    const code = char.charCodeAt(0);
    if (code > 126) {
      result += `\\u${code}?`;
    } else {
      result += char;
    }
  }

  return result;
}

function renderChildren(nodes: NodeListOf<ChildNode> | ChildNode[], state: RenderState, context: RenderContext): string {
  const array = Array.from(nodes as unknown as ArrayLike<Node>);
  let result = '';
  for (const node of array) {
    result += renderNode(node, state, context);
  }
  return result;
}

function getListItemIndex(element: Element): number {
  const parent = element.parentElement;
  if (!parent) return 1;
  const children = Array.from(parent.children);
  let index = 0;
  for (const child of children) {
    if (child.tagName.toLowerCase() === 'li') {
      index += 1;
      if (child === element) {
        return index;
      }
    }
  }
  return index || 1;
}

function renderNode(node: Node, state: RenderState, context: RenderContext): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const textContent = node.textContent ?? '';
    if (!textContent) {
      return '';
    }
    return escapeRtfText(textContent, state);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();

  if (INLINE_IGNORED_TAGS.has(tagName)) {
    return '';
  }

  if (tagName === 'br') {
    return '\\line ';
  }

  const computed = context.view.getComputedStyle(element);

  const targetColorIndex = context.getColorIndex(computed.color);
  const wantsBold = isBoldFont(computed.fontWeight) || tagName === 'strong' || tagName === 'b';
  const wantsItalic = computed.fontStyle === 'italic' || tagName === 'em' || tagName === 'i';
  const wantsUnderline = hasUnderline(computed.textDecorationLine) || tagName === 'u';

  const nextState: RenderState = {
    colorIndex: state.colorIndex,
    bold: state.bold,
    italic: state.italic,
    underline: state.underline,
    insidePre: state.insidePre || tagName === 'pre',
    listDepth: state.listDepth,
  };

  const openParts: string[] = [];
  const closeParts: string[] = [];

  if (targetColorIndex && targetColorIndex !== state.colorIndex) {
    openParts.push(`\\cf${targetColorIndex} `);
    closeParts.unshift(`\\cf${state.colorIndex || 0} `);
    nextState.colorIndex = targetColorIndex;
  }

  if (wantsBold !== state.bold) {
    if (wantsBold) {
      openParts.push('\\b ');
      closeParts.unshift('\\b0 ');
    } else {
      openParts.push('\\b0 ');
      closeParts.unshift('\\b ');
    }
    nextState.bold = wantsBold;
  }

  if (wantsItalic !== state.italic) {
    if (wantsItalic) {
      openParts.push('\\i ');
      closeParts.unshift('\\i0 ');
    } else {
      openParts.push('\\i0 ');
      closeParts.unshift('\\i ');
    }
    nextState.italic = wantsItalic;
  }

  if (wantsUnderline !== state.underline) {
    if (wantsUnderline) {
      openParts.push('\\ul ');
      closeParts.unshift('\\ulnone ');
    } else {
      openParts.push('\\ulnone ');
      closeParts.unshift('\\ul ');
    }
    nextState.underline = wantsUnderline;
  }

  const isList = LIST_TAGS.has(tagName);
  const childState: RenderState = {
    ...nextState,
    listDepth: isList ? state.listDepth + 1 : nextState.listDepth,
  };

  if (tagName === 'li') {
    const parentTag = element.parentElement?.tagName.toLowerCase();
    const indentDepth = Math.max(state.listDepth - 1, 0);
    const indent = indentDepth > 0 ? '\\tab '.repeat(indentDepth) : '';
    const marker = parentTag === 'ol' ? `${getListItemIndex(element)}. ` : '\\bullet ';
    const itemState: RenderState = { ...nextState, listDepth: state.listDepth };
    const content = renderChildren(element.childNodes, itemState, context).replace(/^\s+/, '');
    return `\\par ${openParts.join('')}${indent}${marker}${content}${closeParts.join('')}`;
  }

  const childrenResult = renderChildren(element.childNodes, childState, context);

  if (tagName === 'td' || tagName === 'th') {
    return `${openParts.join('')}${childrenResult}${closeParts.join('')}\\tab `;
  }

  let result = `${openParts.join('')}${childrenResult}${closeParts.join('')}`;

  const display = computed.display;
  const isBlockLike = BLOCK_TAGS.has(tagName) || display === 'block' || display === 'flex' || display === 'grid' || display === 'table' || display === 'list-item';

  if (isBlockLike && !LIST_TAGS.has(tagName)) {
    result += '\\par ';
  }

  return result;
}

export function convertContainerToRtf(container: HTMLElement): string | null {
  const doc = container.ownerDocument;
  const view = doc.defaultView;
  if (!view) return null;

  const { colorTable, getColorIndex, initialColorIndex, fallbackIndex } = collectColors(container, view);

  const context: RenderContext = {
    view,
    getColorIndex,
  };

  const initialState: RenderState = {
    colorIndex: initialColorIndex,
    bold: false,
    italic: false,
    underline: false,
    insidePre: false,
    listDepth: 0,
  };

  const body = renderChildren(container.childNodes, initialState, context);
  if (!body.trim()) {
    return null;
  }

  const parts = [RTF_HEADER, colorTable, RTF_VIEW_KIND, RTF_PARAGRAPH];
  const effectiveInitialColor = initialColorIndex || fallbackIndex;
  if (effectiveInitialColor) {
    parts.push(`\\cf${effectiveInitialColor} `);
  }
  parts.push(body);
  parts.push('}');
  return parts.join('');
}

