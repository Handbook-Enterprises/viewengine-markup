import { describe, expect, test } from 'bun:test';
import { TOOLS } from '@marklayer/agent-tools';
import { publicToolName, publicToolText } from './tool-names';

describe('public tool names', () => {
  test('every shared tool is published under markup_', () => {
    for (const tool of TOOLS) {
      expect(publicToolName(tool.name)).toMatch(/^markup_/);
      // A description pointing an agent at a name it cannot call is a silent dead end.
      expect(publicToolText(tool.description)).not.toContain('marklayer_');
    }
  });
});
