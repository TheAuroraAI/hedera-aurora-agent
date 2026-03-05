/**
 * Tests for HCS Memory Logger
 *
 * Tests the core functionality of committing AI memory to Hedera
 * Consensus Service, using inline mocks for isolation.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Track submitted messages for test assertions
const submittedMessages: Array<{ topicId: string; message: string }> = [];

function clearMessages() {
  submittedMessages.length = 0;
}

// Mock @hashgraph/sdk before importing modules that use it
vi.mock("@hashgraph/sdk", () => {
  let topicCounter = 1000;

  const TopicCreateTransaction = vi.fn().mockImplementation(() => ({
    setTopicMemo: vi.fn().mockReturnThis(),
    setAdminKey: vi.fn().mockReturnThis(),
    setSubmitKey: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({
      getReceipt: vi.fn().mockResolvedValue({
        topicId: {
          toString: () => `0.0.${++topicCounter}`,
          shard: 0,
          realm: 0,
          num: topicCounter,
        },
        status: { toString: () => "SUCCESS" },
      }),
      transactionId: { toString: () => `0.0.1234@${Date.now()}.000000000` },
    }),
  }));

  const TopicMessageSubmitTransaction = vi.fn().mockImplementation(() => {
    let _topicId: string = "unknown";
    let _message: string = "";

    return {
      setTopicId(tid: { toString(): string }) {
        _topicId = tid.toString();
        return this;
      },
      setMessage(msg: string) {
        _message = msg;
        return this;
      },
      execute: vi.fn().mockImplementation(async () => {
        submittedMessages.push({ topicId: _topicId, message: _message });
        return {
          getReceipt: vi.fn().mockResolvedValue({ status: { toString: () => "SUCCESS" } }),
          transactionId: { toString: () => `0.0.1234@${Date.now()}.000000001` },
        };
      }),
    };
  });

  return {
    TopicCreateTransaction,
    TopicMessageSubmitTransaction,
    TopicId: { fromString: (s: string) => ({ toString: () => s }) },
  };
});

vi.stubEnv("HEDERA_ACCOUNT_ID", "0.0.1234");
vi.stubEnv("HEDERA_PRIVATE_KEY", "302e020100300506032b657004220420" + "a".repeat(64));
vi.stubEnv("HEDERA_NETWORK", "testnet");

import {
  createMemoryTopic,
  submitTaskEvent,
  commitMemoryHash,
} from "../hcs/memory-logger.js";
import type { Client, TopicId } from "@hashgraph/sdk";

const mockClient = {
  operatorPublicKey: { toString: () => "mock-public-key" },
  close: vi.fn(),
} as unknown as Client;

const mockTopicId = {
  toString: () => "0.0.5000",
  shard: 0,
  realm: 0,
  num: 5000,
} as unknown as TopicId;

describe("Memory Logger", () => {
  beforeEach(() => {
    clearMessages();
  });

  describe("createMemoryTopic", () => {
    it("creates a new HCS topic", async () => {
      const topicId = await createMemoryTopic(mockClient, "test-agent");
      expect(topicId.toString()).toMatch(/^0\.0\.\d+$/);
    });

    it("returns a valid TopicId object", async () => {
      const topicId = await createMemoryTopic(mockClient, "aurora-v1");
      expect(typeof topicId.toString).toBe("function");
    });
  });

  describe("submitTaskEvent", () => {
    it("submits a task event", async () => {
      await submitTaskEvent(mockClient, mockTopicId, "task", {
        type: "task_start",
        taskId: "task-001",
      });

      expect(submittedMessages).toHaveLength(1);
      const parsed = JSON.parse(submittedMessages[0]!.message);
      expect(parsed.type).toBe("task");
      expect(parsed.data.taskId).toBe("task-001");
    });

    it("submits a decision event", async () => {
      await submitTaskEvent(mockClient, mockTopicId, "decision", {
        type: "session_start",
        sessionId: "sess-abc123",
      });

      expect(submittedMessages).toHaveLength(1);
      const parsed = JSON.parse(submittedMessages[0]!.message);
      expect(parsed.type).toBe("decision");
      expect(parsed.data.sessionId).toBe("sess-abc123");
    });

    it("submits a payment event", async () => {
      await submitTaskEvent(mockClient, mockTopicId, "payment", {
        taskId: "task-001",
        paymentTxId: "0.0.1234@1234567890.000000000",
      });

      expect(submittedMessages).toHaveLength(1);
      const parsed = JSON.parse(submittedMessages[0]!.message);
      expect(parsed.type).toBe("payment");
      expect(parsed.data.paymentTxId).toBeDefined();
    });

    it("includes timestamp at top level", async () => {
      await submitTaskEvent(mockClient, mockTopicId, "task", { taskId: "t1" });
      const parsed = JSON.parse(submittedMessages[0]!.message);
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("includes version field", async () => {
      await submitTaskEvent(mockClient, mockTopicId, "task", { taskId: "t1" });
      const parsed = JSON.parse(submittedMessages[0]!.message);
      expect(parsed.version).toBe("1.0");
    });

    it("submits to the correct topic", async () => {
      const targetTopic = { toString: () => "0.0.9999" } as unknown as TopicId;
      await submitTaskEvent(mockClient, targetTopic, "task", { taskId: "t1" });
      expect(submittedMessages[0]!.topicId).toBe("0.0.9999");
    });
  });

  describe("commitMemoryHash", () => {
    it("commits a memory hash to HCS", async () => {
      const txId = await commitMemoryHash(mockClient, mockTopicId, "Session log", {
        sessionId: "sess-001",
        tasksCompleted: 5,
      });
      expect(txId).toBeDefined();
      expect(typeof txId).toBe("string");
    });

    it("includes SHA-256 hash of memory content", async () => {
      await commitMemoryHash(mockClient, mockTopicId, "important memory data", {
        sessionId: "sess-002",
        tasksCompleted: 0,
      });
      const parsed = JSON.parse(submittedMessages[0]!.message);
      expect(parsed.data.memoryHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("does not include raw memory content", async () => {
      await commitMemoryHash(mockClient, mockTopicId, "my-secret-private-key: abc123", {
        sessionId: "sess-003",
        tasksCompleted: 1,
      });
      expect(submittedMessages[0]!.message).not.toContain("my-secret-private-key");
      expect(submittedMessages[0]!.message).not.toContain("abc123");
    });

    it("includes session metadata in the commit", async () => {
      await commitMemoryHash(mockClient, mockTopicId, "memory", {
        sessionId: "sess-004",
        tasksCompleted: 12,
        sessionDurationMs: 3600000,
      });
      const parsed = JSON.parse(submittedMessages[0]!.message);
      expect(parsed.data.sessionId).toBe("sess-004");
      expect(parsed.data.tasksCompleted).toBe(12);
    });
  });

  describe("multiple events in sequence", () => {
    it("maintains correct event types in order", async () => {
      await submitTaskEvent(mockClient, mockTopicId, "decision", { type: "session_start" });
      await submitTaskEvent(mockClient, mockTopicId, "task", { taskId: "t1" });
      await submitTaskEvent(mockClient, mockTopicId, "task", { taskId: "t2" });
      await commitMemoryHash(mockClient, mockTopicId, "mem", {
        sessionId: "s1",
        tasksCompleted: 2,
      });

      expect(submittedMessages).toHaveLength(4);
      const types = submittedMessages.map((m) => JSON.parse(m.message).type);
      expect(types).toEqual(["decision", "task", "task", "memory_commit"]);
    });
  });
});
