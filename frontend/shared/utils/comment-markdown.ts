// Client copy of server/src/modules/candidate-report/comment-markdown.util.ts
// (kept in sync by hand, like identity-ids.ts) — powers the live "report
// preview" while a reviewer types a RecriAuth comment. Deliberately a small,
// fully controlled markdown subset: input is escaped first and only these
// tags are ever emitted, so the output is safe for dangerouslySetInnerHTML:
//   #, ##, ###        → heading blocks (.md-h1/.md-h2/.md-h3)
//   - item / * item   → <ul class='md-list'>
//   1. item / 1) item → <ol class='md-list'>
//   **bold** *italic* → <strong> / <em>
//   single newline    → <br/> within a paragraph; blank line → new paragraph

const HEADING_PATTERN = /^(#{1,3})\s+(.*)$/;
const UNORDERED_PATTERN = /^[-*]\s+/;
const ORDERED_PATTERN = /^\d+[.)]\s+/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

export function renderCommentMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let index = 0;

  const isBlockStart = (trimmed: string) =>
    HEADING_PATTERN.test(trimmed) ||
    UNORDERED_PATTERN.test(trimmed) ||
    ORDERED_PATTERN.test(trimmed);

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const heading = HEADING_PATTERN.exec(trimmed);
    if (heading) {
      blocks.push(
        `<div class='md-h${heading[1].length}'>${renderInline(heading[2])}</div>`,
      );
      index += 1;
      continue;
    }

    if (UNORDERED_PATTERN.test(trimmed)) {
      const items: string[] = [];
      while (
        index < lines.length &&
        UNORDERED_PATTERN.test(lines[index].trim())
      ) {
        items.push(
          `<li>${renderInline(lines[index].trim().replace(UNORDERED_PATTERN, ''))}</li>`,
        );
        index += 1;
      }
      blocks.push(`<ul class='md-list'>${items.join('')}</ul>`);
      continue;
    }

    if (ORDERED_PATTERN.test(trimmed)) {
      const items: string[] = [];
      while (
        index < lines.length &&
        ORDERED_PATTERN.test(lines[index].trim())
      ) {
        items.push(
          `<li>${renderInline(lines[index].trim().replace(ORDERED_PATTERN, ''))}</li>`,
        );
        index += 1;
      }
      blocks.push(`<ol class='md-list'>${items.join('')}</ol>`);
      continue;
    }

    // Paragraph — consecutive plain lines joined with <br/>.
    const paragraph: string[] = [];
    while (index < lines.length) {
      const lineTrimmed = lines[index].trim();
      if (!lineTrimmed || isBlockStart(lineTrimmed)) break;
      paragraph.push(renderInline(lineTrimmed));
      index += 1;
    }
    blocks.push(`<p class='md-p'>${paragraph.join('<br/>')}</p>`);
  }

  return blocks.join('');
}
