/**
 * The names agents see. The shared tool contract (packages/agent-tools) keeps
 * upstream's `marklayer_*` names so merges from MarkLayer stay clean; both MCP
 * endpoints publish them as `markup_*` and map back on the way in.
 */
export const publicToolName = (name: string): string => name.replace(/^marklayer_/, 'markup_');

/** Tool descriptions cross-reference each other by name; keep those in step. */
export const publicToolText = (text: string): string => text.replace(/\bmarklayer_/g, 'markup_');
