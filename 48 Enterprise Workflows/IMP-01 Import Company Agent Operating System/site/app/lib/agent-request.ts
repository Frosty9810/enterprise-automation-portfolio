export const MAX_AGENT_REQUEST_BYTES = 16_384;

export class AgentRequestError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

/** Bound the bytes before parsing, including chunked requests without a length. */
export async function readAgentRequest(request: Request): Promise<{ agentId: string; task: string }> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new AgentRequestError(415, 'JSON is required.');
  }
  if (Number(request.headers.get('content-length')) > MAX_AGENT_REQUEST_BYTES) {
    await request.body?.cancel().catch(() => {});
    throw new AgentRequestError(413, 'Request is too large.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AgentRequestError(400, 'An agent task is required.');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_AGENT_REQUEST_BYTES) throw new AgentRequestError(413, 'Request is too large.');
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    // A failing producer cancel hook must not replace the validation status.
    await reader.cancel().catch(() => {});
    if (error instanceof AgentRequestError) throw error;
    throw new AgentRequestError(400, 'Valid UTF-8 JSON is required.');
  } finally { reader.releaseLock(); }
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new AgentRequestError(400, 'Invalid JSON request.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AgentRequestError(400, 'An agent task object is required.');
  const { agentId, task } = body as Record<string, unknown>;
  if (typeof agentId !== 'string' || !agentId.trim() || agentId.length > 100 || typeof task !== 'string' || task.trim().length < 8 || task.length > 8_000) {
    throw new AgentRequestError(400, 'A valid agentId and a task of 8 to 8000 characters are required.');
  }
  return { agentId: agentId.trim(), task: task.trim() };
}
