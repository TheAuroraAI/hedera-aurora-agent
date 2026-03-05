/**
 * Persistent — REST API Server
 *
 * HBAR-gated AI task execution with verifiable HCS audit trail.
 * Clients pay HBAR to submit tasks. Every execution is logged to
 * Hedera Consensus Service for tamper-proof verifiability.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { TopicId } from "@hashgraph/sdk";
import { createHederaClient } from "../core/client.js";
import { submitTaskEvent } from "../hcs/memory-logger.js";
import { AuroraAgent } from "../agent/aurora-agent.js";
import { reconstructAgentHistory } from "../hcs/mirror-reader.js";
import type { Client } from "@hashgraph/sdk";

// Task types supported
export type TaskType = "analysis" | "research" | "code_review" | "summary";

interface TaskRequest {
  type: TaskType;
  prompt: string;
  paymentTxId?: string; // HBAR payment transaction ID (optional for free tier)
}

interface TaskResponse {
  taskId: string;
  status: "success" | "error";
  result?: string;
  hcsTxId?: string;
  durationMs: number;
  verificationUrl?: string;
  error?: string;
}

interface HealthResponse {
  status: "ok" | "degraded";
  network: string;
  memoryTopicId: string | null;
  sessionId: string;
  timestamp: string;
}

// Lazy-initialized agent (avoids crash if HEDERA_ACCOUNT_ID not set yet)
let _agent: AuroraAgent | null = null;
let _client: Client | null = null;
let _topicId: TopicId | null = null;

function getAgent(): { agent: AuroraAgent; client: Client; topicId: TopicId } {
  if (!_agent) {
    _client = createHederaClient();
    const topicIdStr = process.env.HEDERA_MEMORY_TOPIC_ID;
    if (!topicIdStr) {
      throw new Error("HEDERA_MEMORY_TOPIC_ID not configured");
    }
    _topicId = TopicId.fromString(topicIdStr);
    _agent = new AuroraAgent(_client, _topicId);
  }
  return { agent: _agent, client: _client!, topicId: _topicId! };
}

const app = new Hono();

// CORS for dashboard access
app.use("*", cors());

// Health check — always works even without testnet account
app.get("/health", (c) => {
  const response: HealthResponse = {
    status: "ok",
    network: process.env.HEDERA_NETWORK ?? "testnet",
    memoryTopicId: process.env.HEDERA_MEMORY_TOPIC_ID ?? null,
    sessionId: process.env.HEDERA_ACCOUNT_ID
      ? `session-${Date.now()}`
      : "unconfigured",
    timestamp: new Date().toISOString(),
  };

  if (!process.env.HEDERA_ACCOUNT_ID || !process.env.HEDERA_MEMORY_TOPIC_ID) {
    response.status = "degraded";
  }

  return c.json(response);
});

// Submit a task — logs execution to HCS
app.post("/tasks", async (c) => {
  const start = Date.now();
  let body: TaskRequest;

  try {
    body = await c.req.json<TaskRequest>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.type || !body.prompt) {
    return c.json({ error: "type and prompt are required" }, 400);
  }

  const validTypes: TaskType[] = [
    "analysis",
    "research",
    "code_review",
    "summary",
  ];
  if (!validTypes.includes(body.type)) {
    return c.json(
      { error: `type must be one of: ${validTypes.join(", ")}` },
      400,
    );
  }

  if (body.prompt.length > 2000) {
    return c.json({ error: "prompt must be <= 2000 characters" }, 400);
  }

  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const { agent, client, topicId } = getAgent();

    const result = await agent.executeTask({
      id: taskId,
      type: body.type,
      prompt: body.prompt,
    });

    // Log payment verification if provided
    if (body.paymentTxId) {
      await submitTaskEvent(client, topicId, "payment", {
        taskId,
        paymentTxId: body.paymentTxId,
        type: body.type,
      });
    }

    const network = process.env.HEDERA_NETWORK ?? "testnet";
    const topicIdStr = topicId.toString();

    const response: TaskResponse = {
      taskId,
      status: result.status,
      result: result.result,
      hcsTxId: result.hcsTxId,
      durationMs: Date.now() - start,
      verificationUrl: `https://hashscan.io/${network}/topic/${topicIdStr}`,
      error: result.error,
    };

    return c.json(response, result.status === "success" ? 200 : 500);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json(
      {
        taskId,
        status: "error",
        error: message,
        durationMs: Date.now() - start,
      } as TaskResponse,
      500,
    );
  }
});

// Get agent memory history from HCS
app.get("/memory", async (c) => {
  const topicIdStr = process.env.HEDERA_MEMORY_TOPIC_ID;
  if (!topicIdStr) {
    return c.json({ error: "HEDERA_MEMORY_TOPIC_ID not configured" }, 503);
  }

  const network = process.env.HEDERA_NETWORK ?? "testnet";
  const limitParam = c.req.query("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : 50;

  try {
    const history = await reconstructAgentHistory(topicIdStr, network as "testnet" | "mainnet");

    return c.json({
      topicId: topicIdStr,
      network,
      hashscanUrl: `https://hashscan.io/${network}/topic/${topicIdStr}`,
      summary: {
        memoryCommits: history.commits.length,
        tasks: history.tasks.length,
        decisions: history.decisions.length,
        payments: history.payments.length,
      },
      recentCommits: history.commits.slice(-Math.min(limit, 10)),
      recentTasks: history.tasks.slice(-limit),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Failed to fetch history: ${message}` }, 500);
  }
});

// Get agent stats
app.get("/stats", async (c) => {
  const topicIdStr = process.env.HEDERA_MEMORY_TOPIC_ID;
  if (!topicIdStr) {
    return c.json({ error: "HEDERA_MEMORY_TOPIC_ID not configured" }, 503);
  }

  const network = process.env.HEDERA_NETWORK ?? "testnet";

  try {
    const history = await reconstructAgentHistory(topicIdStr, network as "testnet" | "mainnet");

    const taskTypes = history.tasks.reduce<Record<string, number>>(
      (acc, task) => {
        const t = task as Record<string, unknown>;
        const data = t["data"] as Record<string, unknown> | undefined;
        const type = (data?.["type"] as string) || "unknown";
        acc[type] = (acc[type] ?? 0) + 1;
        return acc;
      },
      {},
    );

    return c.json({
      topicId: topicIdStr,
      network,
      totalSessions: history.commits.length,
      totalTasks: history.tasks.length,
      totalDecisions: history.decisions.length,
      taskBreakdown: taskTypes,
      verificationUrl: `https://hashscan.io/${network}/topic/${topicIdStr}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Failed to fetch stats: ${message}` }, 500);
  }
});

// Serve dashboard at root
app.get("/", async (c) => {
  const fs = await import("fs/promises");
  const path = await import("path");
  const { fileURLToPath } = await import("url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dashboardPath = path.join(__dirname, "../../public/index.html");
  try {
    const html = await fs.readFile(dashboardPath, "utf-8");
    return c.html(html);
  } catch {
    return c.redirect("/health");
  }
});

export default app;

// Server entrypoint
export async function startServer(port = 3000): Promise<void> {
  const { serve } = await import("@hono/node-server");
  serve({ fetch: app.fetch, port });
  console.log(`🚀 Persistent API running on port ${port}`);
  console.log(`   Health: http://localhost:${port}/health`);
  console.log(`   Submit task: POST http://localhost:${port}/tasks`);
  console.log(
    `   View memory: GET http://localhost:${port}/memory`,
  );
}
