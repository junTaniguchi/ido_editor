export const normalizeMermaidSource = (value: string): string => {
  if (!value) return '';

  const unified = value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    .trim();

  if (!unified) return '';

  const lines = unified.split('\n');
  const headerPattern = /^\s*(flowchart|graph)\s+([A-Za-z]{2})(.*)$/i;
  const headerMatch = lines[0].match(headerPattern);

  if (headerMatch) {
    const [, keyword, orientation, rest] = headerMatch;
    lines[0] = `${keyword} ${orientation.toUpperCase()}`;
    if (rest && rest.trim().length > 0) {
      lines.splice(1, 0, rest.trim());
    }
  } else {
    lines[0] = lines[0].trim();
  }

  return lines
    .map((line, index) => (index === 0 ? line : line.replace(/\s+$/g, '')))
    .join('\n');
};
