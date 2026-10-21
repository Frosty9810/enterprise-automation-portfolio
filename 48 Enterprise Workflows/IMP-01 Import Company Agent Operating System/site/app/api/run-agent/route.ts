import { executeAgent } from "../../lib/agent-system";
import { AgentRequestError, readAgentRequest } from "../../lib/agent-request";

export async function POST(request: Request) {
  try {
    const body = await readAgentRequest(request);
    return Response.json(executeAgent(body.agentId, body.task));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to execute agent.";
    return Response.json({ error: message }, { status: error instanceof AgentRequestError ? error.status : 400 });
  }
}
