import katex from "katex";

/* ------------------------------------------------------------------ *
 * Sanitizer
 *
 * KaTeX emits three kinds of markup: HTML spans, a hidden MathML tree,
 * and — for radicals, stretchy delimiters, accents and rules — inline
 * SVG. The SVG carries the actual surd glyph for \sqrt, so dropping it
 * silently deletes the square-root sign and leaves only the radicand.
 * The allow-lists below therefore cover HTML, MathML and SVG, and the
 * walker sanitizes the parsed document in place so that elements keep
 * the namespace the HTML parser gave them (rebuilding them with
 * document.createElement would put <svg>/<math> in the HTML namespace,
 * where they do not render).
 * ------------------------------------------------------------------ */

const HTML_TAGS = [
  'div', 'span', 'p', 'br', 'em', 'strong', 'b', 'i', 'u', 's', 'sub', 'sup',
  'code', 'pre', 'blockquote', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
];

const MATHML_TAGS = [
  'math', 'semantics', 'annotation', 'annotation-xml', 'mrow', 'mi', 'mo', 'mn',
  'ms', 'mtext', 'mspace', 'msup', 'msub', 'msubsup', 'mfrac', 'msqrt', 'mroot',
  'mover', 'munder', 'munderover', 'mmultiscripts', 'mprescripts', 'none',
  'mtable', 'mtr', 'mtd', 'mlabeledtr', 'mpadded', 'mphantom', 'menclose',
  'mstyle', 'merror', 'mfenced', 'maction',
];

const SVG_TAGS = [
  'svg', 'path', 'g', 'line', 'rect', 'circle', 'ellipse', 'polygon', 'polyline',
  'defs', 'use', 'clippath', 'mask', 'symbol', 'marker', 'lineargradient',
  'radialgradient', 'stop', 'text', 'tspan', 'title', 'desc',
];

const SAFE_TAGS = new Set([...HTML_TAGS, ...MATHML_TAGS, ...SVG_TAGS]);

/** Elements whose text content must never be surfaced as visible text. */
const DROP_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base',
  'noscript', 'template', 'form', 'input', 'button', 'textarea', 'select',
]);

const SAFE_ATTRS = new Set([
  // generic
  'class', 'style', 'aria-hidden', 'aria-label', 'role', 'colspan', 'rowspan', 'span',
  // MathML
  'xmlns', 'encoding', 'mathvariant', 'stretchy', 'fence', 'separator',
  'width', 'height', 'depth', 'lspace', 'rspace', 'voffset', 'accent',
  'accentunder', 'columnalign', 'rowalign', 'columnspacing', 'rowspacing',
  'columnlines', 'rowlines', 'frame', 'framespacing', 'equalrows',
  'equalcolumns', 'displaystyle', 'scriptlevel', 'minsize', 'maxsize',
  'symmetric', 'notation', 'linethickness', 'mathcolor', 'mathbackground',
  // SVG
  'viewbox', 'preserveaspectratio', 'd', 'fill', 'fill-rule', 'stroke',
  'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
  'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'dx', 'dy',
  'points', 'transform', 'offset', 'stop-color', 'stop-opacity', 'opacity',
  'gradientunits', 'patternunits', 'clip-rule', 'text-anchor', 'font-size',
]);

const sanitizeHtml = (html: string): string => {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const walk = (parent: Node): void => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) continue;
      if (node.nodeType !== Node.ELEMENT_NODE) {
        parent.removeChild(node);
        continue;
      }
      const el = node as Element;
      // localName keeps SVG camelCase (clipPath) — compare lowercased.
      const tag = el.localName.toLowerCase();

      if (DROP_TAGS.has(tag)) {
        parent.removeChild(el);
        continue;
      }
      if (!SAFE_TAGS.has(tag)) {
        // Unknown markup degrades to its own text so nothing is lost.
        parent.replaceChild(doc.createTextNode(el.textContent ?? ''), el);
        continue;
      }
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        const unsafeValue = /^\s*(javascript|vbscript|data):/i.test(attr.value);
        if (name.startsWith('on') || !SAFE_ATTRS.has(name) || unsafeValue) {
          el.removeAttributeNode(attr);
        }
      }
      walk(el);
    }
  };

  walk(doc.body);
  return doc.body.innerHTML;
};

/* ------------------------------------------------------------------ *
 * Tokens
 *
 * Maths is pulled out of the source before any markdown processing runs,
 * so that `*`, `_`, `#` and `|` inside LaTeX are never mistaken for
 * markdown syntax and a `|` inside a formula cannot split a table cell.
 * Block-level markdown (tables, lists, headings) is tokenized too, so the
 * paragraph pass never inserts <br> inside generated markup.
 *
 * The delimiters are private-use codepoints: they cannot occur in
 * transcribed exam text and carry no markdown or LaTeX meaning.
 * ------------------------------------------------------------------ */

const TOKEN_OPEN = '\uE000';
const TOKEN_CLOSE = '\uE001';
const TOKEN_RE = /\uE000(\d+)\uE001/g;
const TOKEN_ONLY_RE = /^\uE000(\d+)\uE001$/;

type Token =
  | { kind: 'math'; source: string; display: boolean }
  | { kind: 'html'; html: string };

const tokenRef = (index: number) => `${TOKEN_OPEN}${index}${TOKEN_CLOSE}`;

/**
 * Decide whether a `$...$` candidate is really maths rather than prose
 * containing currency (e.g. "costs $5 and $6"). Tight delimiters — no
 * whitespace immediately inside them — are taken at face value, which is
 * what every model in this app is prompted to emit. Padded delimiters are
 * only accepted when the body carries an unambiguous LaTeX signal.
 */
const isInlineMath = (body: string): boolean => {
  if (!body.trim()) return false;
  if (!/^\s/.test(body) && !/\s$/.test(body)) return true;
  return /[\\^_{}]/.test(body);
};

const tokenizeMath = (input: string, tokens: Token[]): string => {
  const push = (source: string, display: boolean): string => {
    tokens.push({ kind: 'math', source, display });
    return tokenRef(tokens.length - 1);
  };

  return input
    // $$ ... $$ — may span lines
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, body: string) => push(body, true))
    // \[ ... \]
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, body: string) => push(body, true))
    // \( ... \)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_m, body: string) => push(body, false))
    // $ ... $ — a \$ inside the body is an escaped literal, not a terminator
    .replace(/\$((?:\\.|[^$\\])+?)\$(?!\d)/g, (match, body: string) =>
      isInlineMath(body) ? push(body, false) : match,
    );
};

const renderMath = (token: Extract<Token, { kind: 'math' }>): string => {
  try {
    // Display maths needs no wrapper: KaTeX emits <span class="katex-display">,
    // which its stylesheet already lays out as a centred block. A <div> here
    // would be invalid inside the <p> a paragraph of prose is wrapped in.
    return katex.renderToString(token.source, {
      displayMode: token.display,
      throwOnError: false,
      strict: false,
      trust: false,
    });
  } catch {
    return `<span class="katex-error">${token.source}</span>`;
  }
};

/**
 * Substitute tokens back in. Block tokens (tables, lists) contain maths
 * tokens of their own, and String.replace does not rescan what it inserts,
 * so this repeats until the output is token-free.
 */
const restoreTokens = (html: string, tokens: Token[]): string => {
  let out = html;
  // One pass per nesting level; block tokens are only ever one level deep,
  // the bound is simply a guard against a malformed token index cycling.
  for (let pass = 0; pass < 5 && TOKEN_RE.test(out); pass++) {
    TOKEN_RE.lastIndex = 0;
    out = out.replace(TOKEN_RE, (match, rawIndex: string) => {
      const token = tokens[Number(rawIndex)];
      if (!token) return match;
      return token.kind === 'html' ? token.html : renderMath(token);
    });
    TOKEN_RE.lastIndex = 0;
  }
  TOKEN_RE.lastIndex = 0;
  return out;
};

/* ------------------------------------------------------------------ *
 * Markdown-lite
 * ------------------------------------------------------------------ */

/** Inline markdown. Runs on text that has already had its maths removed. */
const renderInline = (text: string): string =>
  text
    .replace(/`([^`\n]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-[0.9em]">$1</code>')
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>')
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, '$1<em>$2</em>')
    // A backslash-escaped dollar outside maths is a literal dollar sign.
    .replace(/\\\$/g, '$');

const isSeparatorRow = (line: string): boolean =>
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

const splitRow = (line: string): string[] => {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let buf = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      buf += '|';
      i++;
      continue;
    }
    if (s[i] === '|') {
      cells.push(buf.trim());
      buf = '';
      continue;
    }
    buf += s[i];
  }
  cells.push(buf.trim());
  return cells;
};

const TH_CLASS =
  'border border-border bg-muted px-2 py-1 text-left align-top text-sm font-semibold';
const TD_CLASS = 'border border-border px-2 py-1 align-top text-sm';

const renderTable = (header: string[], rows: string[][]): string => {
  const thead =
    '<thead><tr>' +
    header.map((h) => `<th class="${TH_CLASS}">${renderInline(h)}</th>`).join('') +
    '</tr></thead>';
  const tbody =
    '<tbody>' +
    rows
      .map(
        (r) =>
          '<tr>' +
          r.map((c) => `<td class="${TD_CLASS}">${renderInline(c)}</td>`).join('') +
          '</tr>',
      )
      .join('') +
    '</tbody>';
  return `<table class="my-2 w-full border-collapse border border-border">${thead}${tbody}</table>`;
};

const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+(.*)$/;
const ORDERED_ITEM = /^\s*\d+[.)]\s+/;
const HEADING = /^\s*(#{1,6})\s+(.*?)\s*#*\s*$/;

const HEADING_CLASS: Record<number, string> = {
  1: 'mt-3 mb-1 text-lg font-semibold',
  2: 'mt-3 mb-1 text-base font-semibold',
  3: 'mt-3 mb-1 text-sm font-semibold',
  4: 'mt-2 mb-1 text-sm font-semibold',
  5: 'mt-2 mb-1 text-sm font-semibold',
  6: 'mt-2 mb-1 text-sm font-semibold',
};

/**
 * Turn markdown-lite block structure (tables, lists, headings) into HTML,
 * emitting each block as a token and leaving ordinary prose as lines.
 */
const renderBlocks = (input: string, tokens: Token[]): string => {
  const pushHtml = (html: string): string => {
    tokens.push({ kind: 'html', html });
    return tokenRef(tokens.length - 1);
  };

  const lines = input.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Table
    if (line.includes('|') && isSeparatorRow(lines[i + 1] ?? '')) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push(pushHtml(renderTable(header, rows)));
      continue;
    }

    // Heading
    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(
        pushHtml(
          `<h${level} class="${HEADING_CLASS[level]}">${renderInline(heading[2])}</h${level}>`,
        ),
      );
      i++;
      continue;
    }

    // List — a run of consecutive bullet or numbered items
    if (LIST_ITEM.test(line)) {
      const ordered = ORDERED_ITEM.test(line);
      const items: string[] = [];
      while (i < lines.length) {
        const item = LIST_ITEM.exec(lines[i]);
        if (!item || ORDERED_ITEM.test(lines[i]) !== ordered) break;
        items.push(item[2]);
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      const listClass = ordered
        ? 'my-1 ml-5 list-decimal space-y-0.5'
        : 'my-1 ml-5 list-disc space-y-0.5';
      out.push(
        pushHtml(
          `<${tag} class="${listClass}">` +
            items.map((t) => `<li>${renderInline(t)}</li>`).join('') +
            `</${tag}>`,
        ),
      );
      continue;
    }

    out.push(renderInline(line));
    i++;
  }

  return out.join('\n');
};

/**
 * Collapse the line-based intermediate form into HTML: blank lines start a
 * new paragraph, single newlines become <br>, and block tokens (tables,
 * lists, headings) stand on their own.
 */
const joinParagraphs = (input: string, tokens: Token[]): string => {
  const isBlockToken = (line: string): boolean => {
    const match = TOKEN_ONLY_RE.exec(line.trim());
    return match ? tokens[Number(match[1])]?.kind === 'html' : false;
  };

  const parts: Array<{ block: boolean; html: string }> = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length === 0) return;
    parts.push({ block: false, html: paragraph.join('<br>') });
    paragraph = [];
  };

  for (const line of input.split('\n')) {
    if (isBlockToken(line)) {
      flush();
      parts.push({ block: true, html: line.trim() });
      continue;
    }
    if (line.trim() === '') {
      flush();
      continue;
    }
    paragraph.push(line);
  }
  flush();

  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].html;
  // Tables, lists and headings must never be wrapped in <p>: the HTML parser
  // closes the paragraph before them and leaves empty <p></p> behind.
  return parts
    .map((p) => (p.block ? p.html : `<p class="mb-2 last:mb-0">${p.html}</p>`))
    .join('');
};

/**
 * Convert LaTeX/markdown source text to sanitized HTML.
 *
 * Pipeline: pull maths out into tokens → apply markdown (tables, lists,
 * headings, bold/italic) to what is left → render the maths with KaTeX →
 * sanitize. Shared by <LatexRenderer> and the off-screen rendering used for
 * PDF/print export, so every surface renders identically.
 */
export const renderLatexToHtml = (content: string): string => {
  if (!content) return '';
  const tokens: Token[] = [];
  const withoutMath = tokenizeMath(content, tokens);
  const blocks = renderBlocks(withoutMath, tokens);
  const joined = joinParagraphs(blocks, tokens);
  return sanitizeHtml(restoreTokens(joined, tokens));
};
