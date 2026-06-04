import katex from "katex";

const SAFE_TAGS = new Set([
  'div', 'span', 'math', 'semantics', 'mrow', 'mi', 'mo', 'mn',
  'msup', 'msub', 'mfrac', 'mover', 'munder', 'munderover',
  'mtable', 'mtr', 'mtd', 'msqrt', 'mroot', 'mtext', 'mspace',
  'annotation', 'br', 'p', 'em', 'strong', 'b', 'i', 'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
]);
const SAFE_ATTRS = new Set(['class', 'style', 'xmlns', 'encoding', 'mathvariant', 'stretchy', 'fence', 'separator', 'width', 'height', 'depth', 'lspace', 'rspace', 'accent', 'accentunder', 'columnalign', 'rowalign', 'columnspacing', 'rowspacing', 'columnlines', 'rowlines', 'frame', 'framespacing', 'equalrows', 'equalcolumns', 'displaystyle', 'scriptlevel', 'minsize', 'maxsize', 'symmetric']);

const sanitizeHtml = (html: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const sanitizeNode = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) return node.cloneNode(true);
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as Element;
    const tagName = el.tagName.toLowerCase();
    if (!SAFE_TAGS.has(tagName)) {
      const span = document.createElement('span');
      span.textContent = el.textContent || '';
      return span;
    }
    const newEl = document.createElement(tagName);
    for (const attr of Array.from(el.attributes)) {
      if (SAFE_ATTRS.has(attr.name) && !attr.value.includes('javascript:')) {
        newEl.setAttribute(attr.name, attr.value);
      }
    }
    for (const child of Array.from(el.childNodes)) {
      const sanitized = sanitizeNode(child);
      if (sanitized) newEl.appendChild(sanitized);
    }
    return newEl;
  };

  const container = document.createElement('div');
  for (const child of Array.from(doc.body.childNodes)) {
    const sanitized = sanitizeNode(child);
    if (sanitized) container.appendChild(sanitized);
  }
  return container.innerHTML;
};

const isSeparatorRow = (line: string): boolean =>
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

const splitRow = (line: string): string[] => {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let buf = '';
  let inMath = false;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const prev = i > 0 ? s[i - 1] : '';
    if (ch === '\\' && s[i + 1] === '|') {
      buf += '|';
      i += 2;
      continue;
    }
    if (ch === '$' && prev !== '\\') {
      inMath = !inMath;
      buf += ch;
      i++;
      continue;
    }
    if (ch === '|' && !inMath) {
      cells.push(buf.trim());
      buf = '';
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  cells.push(buf.trim());
  return cells;
};

const convertMarkdownTables = (input: string): string => {
  const lines = input.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1] ?? '';
    if (line.includes('|') && isSeparatorRow(next)) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i]));
        i++;
      }
      const thead =
        '<thead><tr>' +
        header
          .map(
            (h) =>
              `<th class="border border-border bg-muted px-2 py-1 text-left align-top text-sm font-semibold">${h}</th>`,
          )
          .join('') +
        '</tr></thead>';
      const tbody =
        '<tbody>' +
        rows
          .map(
            (r) =>
              '<tr>' +
              r
                .map(
                  (c) =>
                    `<td class="border border-border px-2 py-1 align-top text-sm">${c}</td>`,
                )
                .join('') +
              '</tr>',
          )
          .join('') +
        '</tbody>';
      out.push(
        `<table class="my-2 w-full border-collapse border border-border">${thead}${tbody}</table>`,
      );
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join('\n');
};

/**
 * Convert LaTeX/markdown-table source text to sanitized HTML.
 * Shared by <LatexRenderer> and any off-screen rendering for PDF export.
 */
export const renderLatexToHtml = (content: string): string => {
  const withTables = convertMarkdownTables(content);
  const processed = withTables
    .replace(/\$\$(.*?)\$\$/g, (_, math) => {
      try {
        return `<div class="katex-display">${katex.renderToString(math, {
          displayMode: true,
          throwOnError: false,
        })}</div>`;
      } catch {
        return `<div class="katex-error">$$${math}$$</div>`;
      }
    })
    .replace(/\$([^$]+?)\$/g, (_, math) => {
      try {
        return katex.renderToString(math, {
          displayMode: false,
          throwOnError: false,
        });
      } catch {
        return `<span class="katex-error">$${math}$</span>`;
      }
    });
  return sanitizeHtml(processed);
};