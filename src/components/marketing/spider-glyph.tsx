import { Icon } from "lucide-react";
import { spider, spiderWeb } from "@lucide/lab";

type GlyphProps = { className?: string; "aria-hidden"?: boolean };

/** The resident spider — stands in wherever a generic pet-paw motif would
 * appear on other sites. */
export function SpiderGlyph(props: GlyphProps) {
  return <Icon iconNode={spider} {...props} />;
}

/** A spider web — the alternate brand glyph. */
export function SpiderWebGlyph(props: GlyphProps) {
  return <Icon iconNode={spiderWeb} {...props} />;
}