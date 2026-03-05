/**
 * Tests for HCS-10 Agent Registration Protocol
 *
 * Validates HCS-10 message formatting, mock registration,
 * and inbound message polling.
 */
import { describe, it, expect, vi } from "vitest";
import {
  HCS10_REGISTRY_TOPIC_TESTNET,
  HCS10_REGISTRY_TOPIC_MAINNET,
  mockRegistration,
  pollInboundMessages,
} from "../hcs/hcs10-agent.js";

describe("HCS-10 Constants", () => {
  it("has correct testnet registry topic", () => {
    expect(HCS10_REGISTRY_TOPIC_TESTNET).toMatch(/^0\.0\.\d+$/);
  });

  it("has correct mainnet registry topic", () => {
    expect(HCS10_REGISTRY_TOPIC_MAINNET).toMatch(/^0\.0\.\d+$/);
  });

  it("testnet and mainnet registry topics are different", () => {
    expect(HCS10_REGISTRY_TOPIC_TESTNET).not.toBe(HCS10_REGISTRY_TOPIC_MAINNET);
  });
});

describe("mockRegistration", () => {
  it("creates a registration with all required fields", () => {
    const reg = mockRegistration({
      name: "Aurora AI",
      description: "Autonomous AI agent with verifiable memory",
      capabilities: ["analysis", "research", "code_review"],
    });

    expect(reg.agentId).toBeDefined();
    expect(reg.inboundTopicId).toBeDefined();
    expect(reg.name).toBe("Aurora AI");
    expect(reg.description).toBeDefined();
    expect(reg.capabilities).toHaveLength(3);
    expect(reg.registeredAt).toBeDefined();
  });

  it("registeredAt is a valid ISO timestamp", () => {
    const reg = mockRegistration({
      name: "Test Agent",
      description: "Test",
      capabilities: [],
    });
    expect(new Date(reg.registeredAt).toISOString()).toBe(reg.registeredAt);
  });

  it("includes registryTxId", () => {
    const reg = mockRegistration({
      name: "Test",
      description: "Test",
      capabilities: ["research"],
    });
    expect(reg.registryTxId).toBeDefined();
  });

  it("formats agent ID in Hedera style", () => {
    const reg = mockRegistration({ name: "A", description: "B", capabilities: [] });
    expect(reg.agentId).toMatch(/^0\.0\./);
  });
});

describe("pollInboundMessages", () => {
  it("returns empty array when no messages", async () => {
    // Mock fetch for mirror node API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [] }),
    }) as unknown as typeof fetch;

    const messages = await pollInboundMessages("0.0.5001", "testnet");
    expect(messages).toEqual([]);
  });

  it("parses base64-encoded HCS-10 messages", async () => {
    const hcs10Message = {
      p: "hcs-10",
      op: "message",
      m: "Hello agent",
      timestamp: new Date().toISOString(),
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        messages: [
          {
            message: Buffer.from(JSON.stringify(hcs10Message)).toString("base64"),
            sequence_number: 1,
            consensus_timestamp: "1234567890.000000000",
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const messages = await pollInboundMessages("0.0.5001", "testnet");
    expect(messages).toHaveLength(1);
    expect(messages[0]!.p).toBe("hcs-10");
    expect(messages[0]!.op).toBe("message");
  });

  it("filters out non-HCS-10 messages", async () => {
    const nonHCS10 = { arbitrary: "data", not_hcs10: true };
    const hcs10 = { p: "hcs-10", op: "message", timestamp: new Date().toISOString() };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        messages: [
          { message: Buffer.from(JSON.stringify(nonHCS10)).toString("base64") },
          { message: Buffer.from(JSON.stringify(hcs10)).toString("base64") },
        ],
      }),
    }) as unknown as typeof fetch;

    const messages = await pollInboundMessages("0.0.5001", "testnet");
    expect(messages).toHaveLength(1);
    expect(messages[0]!.p).toBe("hcs-10");
  });

  it("skips malformed (non-JSON) messages without crashing", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        messages: [
          { message: Buffer.from("not valid json {{{{").toString("base64") },
          { message: Buffer.from("also bad").toString("base64") },
        ],
      }),
    }) as unknown as typeof fetch;

    const messages = await pollInboundMessages("0.0.5001", "testnet");
    expect(messages).toEqual([]);
  });

  it("throws when mirror node returns error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    }) as unknown as typeof fetch;

    await expect(pollInboundMessages("0.0.5001", "testnet")).rejects.toThrow("429");
  });

  it("uses mainnet URL for mainnet network", async () => {
    let capturedUrl = "";
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return { ok: true, json: async () => ({ messages: [] }) };
    }) as unknown as typeof fetch;

    await pollInboundMessages("0.0.5001", "mainnet");
    expect(capturedUrl).toContain("mainnet-public.mirrornode.hedera.com");
  });

  it("uses testnet URL for testnet network", async () => {
    let capturedUrl = "";
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return { ok: true, json: async () => ({ messages: [] }) };
    }) as unknown as typeof fetch;

    await pollInboundMessages("0.0.5001", "testnet");
    expect(capturedUrl).toContain("testnet.mirrornode.hedera.com");
  });

  it("includes sinceTimestamp in query when provided", async () => {
    let capturedUrl = "";
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return { ok: true, json: async () => ({ messages: [] }) };
    }) as unknown as typeof fetch;

    await pollInboundMessages("0.0.5001", "testnet", "2026-03-01T00:00:00Z");
    expect(capturedUrl).toContain("timestamp=gte:");
  });
});
