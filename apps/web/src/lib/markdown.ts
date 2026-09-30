/**
 * Just enough Markdown to show REGLAS.md inside the app.
 *
 * The rules live in one file at the root of the repo, so they can be read on
 * GitHub, and the app renders that same file rather than a second copy that
 * would drift from it. This parser handles what that file uses and nothing
 * else: headings, paragraphs, the two kinds of list, tables, and bold, italic
 * and code inline.
 *
 * It produces data, never markup. Nothing here can emit HTML, so a rules file
 * that one day contains a `<script>` shows up as the words `<script>`.
 */

export type Inline =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'bold'; readonly text: string }
  | { readonly kind: 'italic'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string };

export type Block =
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3; readonly content: Inline[] }
  | { readonly kind: 'paragraph'; readonly content: Inline[] }
  | { readonly kind: 'list'; readonly ordered: boolean; readonly items: Inline[][] }
  | { readonly kind: 'table'; readonly header: Inline[][]; readonly rows: Inline[][][] };

/** `**bold**`, `_italic_` and `` `code` ``, in one pass. */
const INLINE = /\*\*([^*]+)\*\*|_([^_]+)_|`([^`]+)`/g;

export const parseInline = (text: string): Inline[] => {
  const out: Inline[] = [];
  let at = 0;

  for (const match of text.matchAll(INLINE)) {
    if (match.index > at) out.push({ kind: 'text', text: text.slice(at, match.index) });
    const [, bold, italic, code] = match;
    if (bold !== undefined) out.push({ kind: 'bold', text: bold });
    else if (italic !== undefined) out.push({ kind: 'italic', text: italic });
    else if (code !== undefined) out.push({ kind: 'code', text: code });
    at = match.index + match[0].length;
  }

  if (at < text.length) out.push({ kind: 'text', text: text.slice(at) });
  return out.length > 0 ? out : [{ kind: 'text', text }];
};

/** The cells of one table row, without the outer pipes. */
const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

const isSeparator = (line: string): boolean => /^\|[\s:|-]+\|$/.test(line.trim());

export const parseMarkdown = (source: string): Block[] => {
  const lines = source.split('\n');
  const blocks: Block[] = [];

  /** The paragraph being collected, if any: Markdown joins wrapped lines. */
  let paragraph: string[] = [];
  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: 'paragraph', content: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';

    if (line.trim() === '') {
      flushParagraph();
      continue;
    }

    const heading = /^(#{1,3}) +(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({
        kind: 'heading',
        level: (heading[1]?.length ?? 1) as 1 | 2 | 3,
        content: parseInline(heading[2] ?? ''),
      });
      continue;
    }

    if (line.startsWith('|')) {
      flushParagraph();
      const header = cells(line);
      let at = index + 1;
      if (isSeparator(lines[at] ?? '')) at += 1;
      const rows: string[][] = [];
      while (at < lines.length && (lines[at] ?? '').startsWith('|')) {
        rows.push(cells(lines[at] ?? ''));
        at += 1;
      }
      blocks.push({
        kind: 'table',
        header: header.map(parseInline),
        rows: rows.map((row) => row.map(parseInline)),
      });
      index = at - 1;
      continue;
    }

    const bullet = /^([-*]|\d+\.) +(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      const ordered = !/^[-*]$/.test(bullet[1] ?? '');
      const items: string[] = [bullet[2] ?? ''];
      let at = index + 1;
      while (at < lines.length) {
        const next = lines[at] ?? '';
        const another = /^([-*]|\d+\.) +(.*)$/.exec(next);
        if (another && !/^[-*]$/.test(another[1] ?? '') === ordered) {
          items.push(another[2] ?? '');
          at += 1;
          continue;
        }
        // An indented line continues the item above: the file wraps at 100
        // columns and a wrapped bullet is still one bullet.
        if (/^\s+\S/.test(next) && items.length > 0) {
          items[items.length - 1] = `${items[items.length - 1] ?? ''} ${next.trim()}`;
          at += 1;
          continue;
        }
        break;
      }
      blocks.push({ kind: 'list', ordered, items: items.map(parseInline) });
      index = at - 1;
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  return blocks;
};
