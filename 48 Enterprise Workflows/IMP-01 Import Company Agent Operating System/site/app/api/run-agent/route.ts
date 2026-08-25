import { executeAgent } from "../../lib/agent-system";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { agentId?: string; task?: string };
    if (!body.agentId || !body.task) {
      return Response.json({ error: "agentId and task are required." }, { status: 400 });
    }
    return Response.json(executeAgent(body.agentId, body.task));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to execute agent.";
    return Response.json({ error: message }, { status: 400 });
  }
}
