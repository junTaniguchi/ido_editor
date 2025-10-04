export const normalizeMermaidSource = (value: string): string => {
  if (!value) return '';

  const unified = value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    .trim();

  if (!unified) return '';

  const lines = unified.split('\n');
  const flowchartHeaderPattern = /^\s*(flowchart|graph)\s+([A-Za-z]{2})(.*)$/i;
  const flowchartHeaderMatch = lines[0].match(flowchartHeaderPattern);

  if (flowchartHeaderMatch) {
    const [, keyword, orientation, rest] = flowchartHeaderMatch;
    lines[0] = `${keyword} ${orientation.toUpperCase()}`;
    if (rest && rest.trim().length > 0) {
      lines.splice(1, 0, rest.trim());
    }
  } else {
    const gitGraphHeaderPattern = /^\s*(gitgraph)\b(?:\s+([A-Za-z]{2}))?\s*:?(.*)$/i;
    const gitGraphHeaderMatch = lines[0].match(gitGraphHeaderPattern);

    if (gitGraphHeaderMatch) {
      const [, keyword, orientation, rest] = gitGraphHeaderMatch;
      const normalizedOrientation = orientation ? orientation.toUpperCase() : 'LR';
      const headerLine = `${keyword} ${normalizedOrientation}:`;
      lines[0] = headerLine;
      const remainder = rest?.trim();
      if (remainder) {
        lines.splice(1, 0, remainder);
      }
    } else {
      lines[0] = lines[0].trim();
    }
  }

  return lines
    .map((line, index) => (index === 0 ? line : line.replace(/\s+$/g, '')))
    .join('\n');
};
