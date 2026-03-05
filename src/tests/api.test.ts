/**
 * Tests for the REST API server
 *
 * Tests the Hono API endpoints using mock Hedera client.
 * Validates request validation, response formats, and error handling.
 */
import { describe, it, expect, vi } from "vitest";

// Must be set before any module imports
vi.stubEnv("HEDERA_ACCOUNT_ID", "0.0.1234");
vi.stubEnv("HEDERA_PRIVATE_KEY", "302e020100300506032b657004220420" + "a".repeat(64));
vi.stubEnv("HEDERA_NETWORK", "testnet");
vi.stubEnv("HEDERA_MEMORY_TOPIC_ID", "0.0.5000");
vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-used");

// Mock Hedera SDK with inline factories
vi.mock("@hashgraph/sdk", () => ({
  TopicCreateTransaction: vi.fn().mockImplementation(() => ({
    setTopicMemo: vi.fn().mockReturnThis(),
    setAdminKey: vi.fn().mockReturnThis(),
    setSubmitKey: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({
      getReceipt: vi.fn().mockResolvedValue({
        topicId: { toString: () => "0.0.5001" },
      }),
      transactionId: { toString: () => "mock-create-tx" },
    }),
  })),
  TopicMessageSubmitTransaction: vi.fn().mockImplementation(() => {
    let _topicId = "";
    let _message = "";
    return {
      setTopicId(t: { toString(): string }) { _topicId = t.toString(); return this; },
      setMessage(m: string) { _message = m; return this; },
      execute: vi.fn().mockResolvedValue({
        getReceipt: vi.fn().mockResolvedValue({ status: { toString: () => "SUCCESS" } }),
        transactionId: { toString: () => "mock-submit-tx" },
      }),
    };
  }),
  TopicId: {
    fromString: (s: string) => ({ toString: () => s }),
  },
  AccountId: {
    fromString: (s: string) => ({ toString: () => s }),
  },
  PrivateKey: {
    fromStringED25519: () => ({
      publicKey: { toString: () => "mock-pub" },
    }),
  },
  Client: {
    forTestnet: () => ({
      setOperator: vi.fn(),
      operatorPublicKey: { toString: () => "mock-pub" },
      close: vi.fn(),
    }),
    forMainnet: () => ({
      setOperator: vi.fn(),
      operatorPublicKey: { toString: () => "mock-pub" },
      close: vi.fn(),
    }),
  },
}));

// Mock Anthropic SDK to avoid real API calls
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Mock AI response for testing purposes." }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  })),
}));

// Mock mirror reader to avoid network calls
vi.mock("../hcs/mirror-reader.js", () => ({
  reconstructAgentHistory: vi.fn().mockResolvedValue({
    commits: [
      {
        type: "memory_commit",
        data: { sessionId: "sess-001", tasksCompleted: 5, memoryHash: "a".repeat(64) },
        timestamp: "2026-03-05T10:00:00Z",
      },
    ],
    tasks: [
      { type: "task", data: { taskId: "t1", type: "analysis" }, timestamp: "2026-03-05T10:01:00Z" },
    ],
    decisions: [
      { type: "decision", data: { type: "session_start" }, timestamp: "2026-03-05T10:00:00Z" },
    ],
    payments: [],
  }),
  verifyMemoryIntegrity: vi.fn().mockResolvedValue(true),
}));

import app from "../api/server.js";

describe("API — GET /health", () => {
  it("returns 200 with ok status", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
  });

  it("includes network info", async () => {
    const res = await app.request("/health");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.network).toBe("testnet");
  });

  it("includes memory topic ID", async () => {
    const res = await app.request("/health");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.memoryTopicId).toBe("0.0.5000");
  });

  it("includes ISO timestamp", async () => {
    const res = await app.request("/health");
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.timestamp).toBe("string");
    expect(body.timestamp as string).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("API — POST /tasks", () => {
  it("accepts valid analysis task", async () => {
    const res = await app.request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "analysis",
        prompt: "Explain why verifiable AI memory on Hedera matters.",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("success");
    expect(typeof body.taskId).toBe("string");
    expect(typeof body.result).toBe("string");
  });

  it("task ID matches expected pattern", async () => {
    const res = await app.request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "research", prompt: "What is HCS?" }),
    });

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.taskId).toMatch(/^task-\d+-[a-z0-9]+$/);
  });

  it("returns HCS transaction ID", async () => {
    const res = await app.request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "analysis", prompt: "Test" }),
    });

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.hcsTxId).toBeDefined();
  });

  it("returns HashScan verification URL", async () => {
    const res = await app.request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "analysis", prompt: "Test" }),
    });

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.verificationUrl).toContain("hashscan.io");
    expect(body.verificationUrl).toContain("testnet");
  });

  it("returns durationMs as number", async () => {
    const res = await app.request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "summary", prompt: "Test" }),
    });

    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.durationMs).toBe("number");
    expect(body.durationMs as number).toBeGreaterThanOrEqual(0);
  });

  describe("request validation", () => {
    it("rejects missing type field", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "No type given" }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects missing prompt field", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "analysis" }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects invalid task type", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "hack_mainnet", prompt: "Do evil" }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects prompt over 2000 characters", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "analysis", prompt: "x".repeat(2001) }),
      });
      expect(res.status).toBe(400);
    });

    it("accepts prompt of exactly 2000 characters", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "analysis", prompt: "x".repeat(2000) }),
      });
      expect(res.status).toBe(200);
    });

    it("rejects malformed JSON body", async () => {
      const res = await app.request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json {",
      });
      expect(res.status).toBe(400);
    });

    it("accepts all valid task types", async () => {
      const validTypes = ["analysis", "research", "code_review", "summary"];
      for (const type of validTypes) {
        const res = await app.request("/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, prompt: "Test prompt" }),
        });
        expect(res.status).toBe(200);
      }
    });
  });
});

describe("API — GET /memory", () => {
  it("returns memory history with 200", async () => {
    const res = await app.request("/memory");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.topicId).toBe("0.0.5000");
  });

  it("includes summary counts", async () => {
    const res = await app.request("/memory");
    const body = (await res.json()) as Record<string, unknown>;
    const summary = body.summary as Record<string, number>;
    expect(typeof summary.memoryCommits).toBe("number");
    expect(typeof summary.tasks).toBe("number");
  });

  it("includes HashScan URL", async () => {
    const res = await app.request("/memory");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.hashscanUrl).toContain("hashscan.io");
  });

  it("accepts limit query parameter", async () => {
    const res = await app.request("/memory?limit=10");
    expect(res.status).toBe(200);
  });
});

describe("API — GET /stats", () => {
  it("returns agent statistics", async () => {
    const res = await app.request("/stats");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.totalSessions).toBe("number");
    expect(typeof body.totalTasks).toBe("number");
  });

  it("includes task breakdown", async () => {
    const res = await app.request("/stats");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.taskBreakdown).toBeDefined();
  });

  it("includes verification URL", async () => {
    const res = await app.request("/stats");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.verificationUrl).toContain("hashscan.io");
  });
});

describe("API — CORS headers", () => {
  it("sets CORS allow-origin header", async () => {
    const res = await app.request("/health", {
      headers: { Origin: "https://example.com" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeTruthy();
  });
});
