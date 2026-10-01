import { Marked, Parser, Renderer, type Tokens } from "marked";
import GithubSlugger from "github-slugger";

export type TocEntry = { id: string; text: string; level: 2 | 3 };

/** Renders trusted repo-authored markdown to HTML. Headings at levels 2 and 3
 * receive slug ids (one shared GithubSlugger, in document order) so the "In
 * This Article" TOC anchors match exactly. Other levels render without ids.
 * The token list is lexed once and parsed from those same token objects, so
 * renderer and TOC always agree. */
export function renderMarkdown(source: string): { html: string; toc: TocEntry[] } {
  const slugger = new GithubSlugger();
  const toc: TocEntry[] = [];
  const slugByHeading = new WeakMap<Tokens.Heading, string>();

  const tokens = new Marked().lexer(source);
  for (const token of tokens) {
    if (token.type !== "heading") continue;
    const heading = token as Tokens.Heading;
    if (heading.depth !== 2 && heading.depth !== 3) continue;
    const text = heading.text.trim();
    const id = slugger.slug(text);
    slugByHeading.set(heading, id);
    toc.push({ id, text, level: heading.depth as 2 | 3 });
  }

  const renderer = new Renderer();
  renderer.heading = function (this: { parser: { parseInline: (tokens: Tokens.Generic["tokens"] | undefined) => string } }, token: Tokens.Heading) {
    const inner = this.parser.parseInline(token.tokens ?? []);
    const id = slugByHeading.get(token);
    return `<h${token.depth}${id ? ` id="${id}"` : ""}>${inner}</h${token.depth}>\n`;
  };

  const html = new Parser({ renderer } as ConstructorParameters<typeof Parser>[0]).parse(tokens) as string;
  return { html, toc };
}