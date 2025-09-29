export type DiffRowType = 'meta' | 'hunk' | 'context' | 'remove' | 'add' | 'change' | 'info';

export interface SideBySideRow {
  type: DiffRowType;
  leftNumber: number | null;
  rightNumber: number | null;
  leftText: string;
  rightText: string;
}

export const SPECIAL_ROW_CLASSES: Record<'meta' | 'hunk' | 'info', string> = {
  meta: 'bg-slate-900 text-amber-200',
  hunk: 'bg-slate-800 text-sky-300',
  info: 'bg-slate-900 text-slate-300 italic',
};

export const buildSideBySideRows = (diff: string): SideBySideRow[] => {
  if (!diff) {
    return [];
  }

  const rows: SideBySideRow[] = [];
  const lines = diff.split('\n');
  let inHunk = false;
  let leftLine = 0;
  let rightLine = 0;
  const removedQueue: { text: string; number: number }[] = [];
  const addedQueue: { text: string; number: number }[] = [];

  const flushQueues = () => {
    const maxLength = Math.max(removedQueue.length, addedQueue.length);
    for (let index = 0; index < maxLength; index += 1) {
      const removed = removedQueue[index] ?? null;
      const added = addedQueue[index] ?? null;
      if (!removed && !added) {
        continue;
      }
      rows.push({
        type: removed && added ? 'change' : removed ? 'remove' : 'add',
        leftNumber: removed ? removed.number : null,
        rightNumber: added ? added.number : null,
        leftText: removed ? removed.text : '',
        rightText: added ? added.text : '',
      });
    }
    removedQueue.length = 0;
    addedQueue.length = 0;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');

    if (line.startsWith('@@')) {
      flushQueues();
      inHunk = true;
      const headerMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (headerMatch) {
        leftLine = Number(headerMatch[1]);
        rightLine = Number(headerMatch[3]);
      }
      rows.push({
        type: 'hunk',
        leftNumber: null,
        rightNumber: null,
        leftText: line,
        rightText: '',
      });
      continue;
    }

    if (!inHunk) {
      if (line.length === 0) {
        continue;
      }
      rows.push({
        type: 'meta',
        leftNumber: null,
        rightNumber: null,
        leftText: line,
        rightText: '',
      });
      continue;
    }

    if (line.startsWith('-')) {
      removedQueue.push({ text: line.slice(1), number: leftLine });
      leftLine += 1;
      continue;
    }

    if (line.startsWith('+')) {
      addedQueue.push({ text: line.slice(1), number: rightLine });
      rightLine += 1;
      continue;
    }

    if (line.startsWith(' ')) {
      flushQueues();
      const content = line.slice(1);
      rows.push({
        type: 'context',
        leftNumber: leftLine,
        rightNumber: rightLine,
        leftText: content,
        rightText: content,
      });
      leftLine += 1;
      rightLine += 1;
      continue;
    }

    if (line.startsWith('\\')) {
      flushQueues();
      rows.push({
        type: 'info',
        leftNumber: null,
        rightNumber: null,
        leftText: line,
        rightText: line,
      });
      continue;
    }

    flushQueues();
    if (line.length === 0) {
      continue;
    }
    rows.push({
      type: 'meta',
      leftNumber: null,
      rightNumber: null,
      leftText: line,
      rightText: '',
    });
  }

  flushQueues();
  return rows;
};

export const getLeftCellClass = (row: SideBySideRow) => {
  switch (row.type) {
    case 'remove':
    case 'change':
      return 'bg-rose-900/40 text-rose-100';
    case 'add':
      return 'bg-slate-950 text-slate-500';
    case 'context':
      return 'text-slate-200';
    default:
      return 'text-slate-200';
  }
};

export const getRightCellClass = (row: SideBySideRow) => {
  switch (row.type) {
    case 'add':
    case 'change':
      return 'bg-emerald-900/40 text-emerald-200';
    case 'remove':
      return 'bg-slate-950 text-slate-500';
    case 'context':
      return 'text-slate-200';
    default:
      return 'text-slate-200';
  }
};
