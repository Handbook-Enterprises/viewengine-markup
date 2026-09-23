import { callRoomTool, describedSchema, TOOLS, type ToolContent, type ToolSpec } from '@marklayer/agent-tools';
import { isNewShareId } from '@marklayer/types';
import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import { nanoid } from 'nanoid';
import type { AnnotationRoom } from './annotation-room';
import { ownedStore } from './auth/store';
import { WorkerRoom } from './mcp';
import type { fetchPage } from './proxy';
import { annotationStore } from './store';
import { publicToolName, publicToolText } from './tool-names';

/**
 * The account-wide MCP endpoint, `/mcp`.
 *
 * `/s/:id/mcp` is one board per URL and needs no sign-in, because the share id
 * is the access token. This one sits behind OAuth (see oauth.ts), knows who the
 * agent is acting for, and so can list that person's saved boards and open new
 * ones. Every per-board tool is served here too, with a `room` argument naming
 * the board instead of the URL doing it.
 */

type McpEnv = Parameters<typeof fetchPage>[0]['env'] & {
  DB: D1Database;
  ANNOTATION_ROOM: DurableObjectNamespace<AnnotationRoom>;
};

/** What the OAuth grant carries into every `/mcp` request, set in oauth.ts. */
export interface McpProps {
  userId: string;
  email: string;
}

const text = (value: unknown, isError = false): ToolContent => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

/** A bare id, or a share link like https://markup.viewengine.dev/s/abc123. */
export function parseRoomRef(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!trimmed.includes('/')) return trimmed;
  try {
    return new URL(trimmed).pathname.match(/\/s\/([^/]+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

const ROOM_PROPERTY = {
  type: 'string',
  description: 'The board: a share link like https://markup.viewengine.dev/s/abc123, or the bare id abc123.',
};

/** A per-board tool's schema with the `room` argument added and required. */
function withRoom(schema: ToolSpec['inputSchema']): ToolSpec['inputSchema'] {
  return {
    ...schema,
    properties: { room: ROOM_PROPERTY, ...(schema.properties ?? {}) },
    required: ['room', ...(schema.required ?? [])],
  };
}

async function roomStub(env: McpEnv, id: string) {
  // Same door as getRoomStub in index.ts: never open a room on a guessable id.
  if (!isNewShareId(id) && !(await annotationStore(env.DB).exists(id))) return null;
  return env.ANNOTATION_ROOM.get(env.ANNOTATION_ROOM.idFromName(id));
}

function buildAccountServer({
  env,
  props,
  apiBase,
  agentId,
}: {
  env: McpEnv;
  props: McpProps;
  apiBase: string;
  agentId: string;
}): McpServer {
  const server = new McpServer({ name: 'viewengine-markup', version: '1.0.0' });
  const shareUrl = (id: string) => `${apiBase}/s/${id}`;

  server.registerTool(
    'markup_list_boards',
    {
      description:
        'List the boards saved to your account, newest first, with each share link. Pass a link or id as `room` to the other tools.',
      inputSchema: describedSchema({ type: 'object', additionalProperties: false, properties: {} }),
    },
    async (): Promise<ToolContent> => {
      const links = await ownedStore(env.DB).listAnnotations(props.userId);
      return text(links.map((link) => ({ ...link, link: shareUrl(link.id) })));
    },
  );

  server.registerTool(
    'markup_create_board',
    {
      description:
        'Open a new board on a public web page, saved to your account. Returns the share link to send to reviewers and to pass as `room`.',
      inputSchema: describedSchema({
        type: 'object',
        additionalProperties: false,
        required: ['url'],
        properties: { url: { type: 'string', description: 'The page to review, e.g. https://example.com/pricing.' } },
      }),
    },
    async (args: unknown): Promise<ToolContent> => {
      const raw = (args as { url?: unknown } | null)?.url;
      let url: string;
      try {
        const parsed = new URL(typeof raw === 'string' ? raw.trim() : '');
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('scheme');
        url = parsed.toString();
      } catch {
        return text('`url` must be an http(s) URL.', true);
      }
      const id = nanoid();
      const store = annotationStore(env.DB);
      if (!(await store.put({ id, ops: [], url, width: null, expiresAt: null }))) {
        return text('Could not create the board.', true);
      }
      await ownedStore(env.DB).claimAnnotation({ id, ownerId: props.userId });
      return text({ id, url, link: shareUrl(id) });
    },
  );

  for (const tool of TOOLS) {
    // The room is an argument on every call here, so there is nothing to connect to.
    if (tool.name === 'marklayer_connect_room') continue;
    server.registerTool(
      publicToolName(tool.name),
      { description: publicToolText(tool.description), inputSchema: describedSchema(withRoom(tool.inputSchema)) },
      async (args: unknown): Promise<ToolContent> => {
        const { room: ref, ...rest } = (args ?? {}) as { room?: unknown } & Record<string, unknown>;
        const id = typeof ref === 'string' ? parseRoomRef(ref) : null;
        if (!id) return text('`room` must be a share link or board id.', true);
        const stub = await roomStub(env, id);
        if (!stub) return text(`No board with id ${id}.`, true);
        const room = new WorkerRoom(stub, id, agentId, env, props.userId);
        await room.load();
        const answered = await callRoomTool({ name: tool.name, args: rest, room, apiBase });
        return answered ?? text(`unknown tool: ${tool.name}`, true);
      },
    );
  }
  return server;
}

export async function handleAccountMcpRequest({
  request,
  env,
  props,
}: {
  request: Request;
  env: McpEnv;
  props: McpProps;
}): Promise<Response> {
  const url = new URL(request.url);
  const server = buildAccountServer({
    env,
    props,
    apiBase: url.origin,
    agentId: url.searchParams.get('agent') ?? 'agent',
  });
  // Stateless, like the per-board endpoint: nothing is held between requests.
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(request);
}
