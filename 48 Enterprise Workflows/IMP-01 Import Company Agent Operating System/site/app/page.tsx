"use client";

import { useMemo, useState } from "react";
import { agents, departments, knowledgeRecords, type DepartmentId } from "./lib/agent-system";

type RunResult = {
  runId: string;
  status: string;
  summary: string;
  steps: string[];
  evidence: typeof knowledgeRecords;
  decision: string;
  constraint: string;
  handoff: { owner: string; artifact: string; state: string };
  routingConfidence: number;
};

const defaultTasks: Record<DepartmentId, string> = {
  sales: "Build a qualified distributor handoff for the ELEC-440 product line and show the evidence used.",
  deals: "Prepare a commercial review packet for a 1,200-unit ELEC-440 opportunity with an 18% margin floor.",
  marketing: "Create a sourced campaign brief for ELEC-440 aimed at dependable-stock retail buyers.",
  operations: "Validate shipment SHP-2048 from Shenzhen to Arica and identify any document or approval blockers.",
  intelligence: "Assess current supplier and lane risks affecting the next Pacific Components purchase order.",
  customer: "Prepare an accurate status response for a distributor whose shipment may slip by eight days.",
  "back-office": "Prepare a review packet for a USD 28,000 supplier commitment and list required approvals.",
};

export default function Home() {
  const [panel, setPanel] = useState<"department" | "brain" | null>(null);
  const [departmentId, setDepartmentId] = useState<DepartmentId>("operations");
  const [agentId, setAgentId] = useState("operations-016");
  const [task, setTask] = useState(defaultTasks.operations);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  const department = departments.find((item) => item.id === departmentId)!;
  const departmentAgents = useMemo(() => agents.filter((agent) => agent.departmentId === departmentId), [departmentId]);
  const selectedAgent = agents.find((agent) => agent.id === agentId) ?? departmentAgents[0];

  function openDepartment(id: DepartmentId, preferredAgentId?: string) {
    const firstAgent = preferredAgentId ?? agents.find((agent) => agent.departmentId === id)!.id;
    setDepartmentId(id);
    setAgentId(firstAgent);
    setTask(defaultTasks[id]);
    setResult(null);
    setError("");
    setPanel("department");
  }

  function chooseAgent(id: string) {
    setAgentId(id);
    setResult(null);
    setError("");
  }

  async function runAgent() {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/run-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: selectedAgent.id, task }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Agent run failed.");
      setResult(payload as RunResult);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Agent run failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">P</span>
          <div><strong>PORT / OS</strong><span>Import company agent network</span></div>
        </div>
        <div className="system-status"><i /> Deterministic reference engine</div>
        <button className="run-button" type="button" onClick={() => openDepartment("operations", "operations-016")}>Open command center <span>↗</span></button>
      </header>

      <section className="hero">
        <div className="eyebrow"><span>FUNCTIONAL SYSTEM MAP</span><b>{agents.length} AGENTS</b><b>{departments.length} DEPARTMENTS</b></div>
        <h1>An operating system for<br />the entire import company.</h1>
        <p>Every agent has one job, one permission boundary, and one measurable handoff. The shared company brain keeps decisions grounded in the same supplier, product, logistics, and financial knowledge.</p>
      </section>

      <section className="network" aria-label="Agent department network">
        <button className="brain-card" type="button" onClick={() => setPanel("brain")}>
          <span className="brain-kicker">COMPANY BRAIN · OPEN KNOWLEDGE</span>
          <span className="brain-core"><span>KB</span></span>
          <h2>One source of truth.</h2>
          <p>Products · suppliers · landed cost · customs · customers · policy</p>
          <span className="brain-metrics">
            <span><b>{knowledgeRecords.length}</b> demo records</span>
            <span><b>{new Set(knowledgeRecords.map((record) => record.domain)).size}</b> knowledge domains</span>
          </span>
        </button>

        <div className="department-grid">
          {departments.map((item) => (
            <button className="department-card" key={item.id} type="button" onClick={() => openDepartment(item.id)}>
              <span className="department-top">
                <span className="department-code">{item.code}</span>
                <span className="department-count" style={{ color: item.accent }}>{item.jobs.length} agents</span>
              </span>
              <h3>{item.name}</h3>
              <p>{item.purpose}</p>
              <span className="department-action">Use the agents <b>→</b></span>
            </button>
          ))}
        </div>
      </section>

      <section className="proof-strip" aria-label="System design proof">
        <article><span>01 / FLOW</span><h3>Input to handoff</h3><p>Each run produces evidence, a decision, a constraint, and an explicit next owner.</p></article>
        <article><span>02 / SYSTEM</span><h3>Shared components</h3><p>Registry, knowledge brain, typed execution endpoint, permissions, and audit-ready run IDs.</p></article>
        <article><span>03 / CONSTRAINT</span><h3>Human authority</h3><p>No payment, booking, promise, or external message is executed autonomously.</p></article>
        <article><span>04 / DECISION</span><h3>Deterministic first</h3><p>Reference mode proves the workflow before an optional model adapter adds language intelligence.</p></article>
        <article><span>05 / CUT</span><h3>No agent theater</h3><p>We cut autonomous swarms and animated activity that cannot be tied to a useful output.</p></article>
      </section>

      <footer><span>Functional reference implementation · no client claim</span><span>Measurable handoffs · explicit constraints · human override</span></footer>

      {panel && (
        <div className="overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPanel(null)}>
          <section className="drawer" role="dialog" aria-modal="true" aria-label={panel === "brain" ? "Company knowledge brain" : `${department.name} agents`}>
            <header className="drawer-header">
              <div><span>{panel === "brain" ? "SHARED CONTEXT" : `${department.code} / ${department.name.toUpperCase()}`}</span><h2>{panel === "brain" ? "Company knowledge brain" : `${department.jobs.length} agents. One controlled pipeline.`}</h2></div>
              <button type="button" onClick={() => setPanel(null)} aria-label="Close panel">Close ×</button>
            </header>

            {panel === "brain" ? (
              <div className="knowledge-grid">
                {knowledgeRecords.map((record) => (
                  <article key={record.id}>
                    <span>{record.id} · {record.domain}</span>
                    <h3>{record.title}</h3>
                    <p>{record.detail}</p>
                    <footer><small>{record.source}</small><small>Updated {record.updated}</small></footer>
                  </article>
                ))}
              </div>
            ) : (
              <div className="agent-workspace">
                <aside className="agent-list" aria-label={`${department.name} agent list`}>
                  <p>{department.purpose}</p>
                  {departmentAgents.map((agent) => (
                    <button className={agent.id === selectedAgent.id ? "active" : ""} key={agent.id} type="button" onClick={() => chooseAgent(agent.id)}>
                      <span>{String(agent.number).padStart(2, "0")}</span>{agent.name}
                    </button>
                  ))}
                </aside>

                <div className="executor">
                  <div className="agent-identity"><span>{selectedAgent.id.toUpperCase()}</span><h3>{selectedAgent.name}</h3><p>{selectedAgent.mission}</p></div>
                  <div className="control-grid">
                    <article><span>PERMISSION</span><p>{selectedAgent.permission}</p></article>
                    <article><span>HARD CONSTRAINT</span><p>{selectedAgent.guardrail}</p></article>
                  </div>
                  <label htmlFor="agent-task">Task for this agent</label>
                  <textarea id="agent-task" value={task} onChange={(event) => setTask(event.target.value)} rows={4} />
                  <div className="executor-actions"><span>Local deterministic engine · no external data sent</span><button type="button" onClick={runAgent} disabled={running}>{running ? "Running…" : "Run agent →"}</button></div>
                  {error && <p className="error-message" role="alert">{error}</p>}

                  {result && (
                    <section className="run-result" aria-live="polite">
                      <header><span>{result.runId}</span><b>{result.status.replaceAll("_", " ")}</b></header>
                      <h4>{result.summary}</h4>
                      <ol>{result.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                      <div className="evidence-block"><span>EVIDENCE USED</span>{result.evidence.map((record) => <p key={record.id}><b>{record.id}</b> {record.title}</p>)}</div>
                      <div className="decision-block"><span>DECISION</span><p>{result.decision}</p><span>HANDOFF</span><p>{result.handoff.artifact} → <b>{result.handoff.owner}</b></p></div>
                      <footer><span>Routing confidence {Math.round(result.routingConfidence * 100)}%</span><span>Human review required</span></footer>
                    </section>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
