/**
 * Aurora Memory Logger - Publishes session memory hashes to Hedera Consensus Service
 *
 * Core innovation: AI agent continuity via tamper-proof on-chain memory anchoring.
 * Each session, Aurora commits a cryptographic hash of her memory state to HCS.
 * This creates a verifiable, immutable record of the AI's decision history.
 */
import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicId,
  Client,
} from "@hashgraph/sdk";
import { createHash } from "crypto";

export interface MemoryCommit {
  sessionId: string;
  timestamp: string;
  agentId: string;
  memoryHash: string;
  sessionSummary: string;
  prevCommitId?: string;
  tasksCompleted: number;
  revenueAttempted: number;
  metadata: Record<string, unknown>;
}

export interface HCSMessage {
  type: "memory_commit" | "task_start" | "task_complete" | "task" | "decision" | "payment";
  version: "1.0";
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Create a new HCS topic for an agent's memory log
 */
export async function createMemoryTopic(
  client: Client,
  agentName: string
): Promise<TopicId> {
  const tx = new TopicCreateTransaction()
    .setTopicMemo(`Aurora Memory Log - ${agentName} - ${new Date().toISOString()}`)
    .setAdminKey(client.operatorPublicKey!)
    .setSubmitKey(client.operatorPublicKey!);

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  if (!receipt.topicId) {
    throw new Error("Failed to create HCS topic");
  }

  return receipt.topicId;
}

/**
 * Submit a memory commit to HCS
 */
export async function submitMemoryCommit(
  client: Client,
  topicId: TopicId,
  commit: MemoryCommit
): Promise<string> {
  const message: HCSMessage = {
    type: "memory_commit",
    version: "1.0",
    timestamp: new Date().toISOString(),
    data: commit as unknown as Record<string, unknown>,
  };

  const messageStr = JSON.stringify(message);

  // Validate message size (HCS max is 1KB per chunk, 20 chunks max)
  if (messageStr.length > 20 * 1024) {
    throw new Error(`Message too large: ${messageStr.length} bytes (max 20KB)`);
  }

  const tx = new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(messageStr);

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  // Return the transaction ID as the commit reference
  return response.transactionId.toString();
}

/**
 * Submit a task event to HCS (task started, completed, decision made)
 */
export async function submitTaskEvent(
  client: Client,
  topicId: TopicId,
  eventType: HCSMessage["type"],
  data: Record<string, unknown>
): Promise<string> {
  const message: HCSMessage = {
    type: eventType,
    version: "1.0",
    timestamp: new Date().toISOString(),
    data,
  };

  const tx = new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(JSON.stringify(message));

  const response = await tx.execute(client);
  await response.getReceipt(client);

  return response.transactionId.toString();
}

/**
 * Hash memory content for tamper-proof verification
 */
export function hashMemory(memoryContent: string): string {
  return createHash("sha256").update(memoryContent).digest("hex");
}

/**
 * Commit a memory hash to HCS (does not include raw content — only hash)
 * This is the primary function for anchoring session memory on-chain.
 */
export async function commitMemoryHash(
  client: Client,
  topicId: TopicId,
  memoryContent: string,
  metadata: {
    sessionId: string;
    tasksCompleted: number;
    sessionDurationMs?: number;
    prevCommitId?: string;
    [key: string]: unknown;
  }
): Promise<string> {
  const memoryHash = hashMemory(memoryContent);

  const message: HCSMessage = {
    type: "memory_commit",
    version: "1.0",
    timestamp: new Date().toISOString(),
    data: {
      memoryHash,
      ...metadata,
      // Raw content is intentionally excluded from the message
    },
  };

  const tx = new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(JSON.stringify(message));

  const response = await tx.execute(client);
  await response.getReceipt(client);

  return response.transactionId.toString();
}

/**
 * Create a memory commit from current session state
 */
export function createMemoryCommitFromState(params: {
  sessionId: string;
  agentId: string;
  memoryContent: string;
  sessionSummary: string;
  prevCommitId?: string;
  tasksCompleted?: number;
  revenueAttempted?: number;
  metadata?: Record<string, unknown>;
}): MemoryCommit {
  return {
    sessionId: params.sessionId,
    timestamp: new Date().toISOString(),
    agentId: params.agentId,
    memoryHash: hashMemory(params.memoryContent),
    sessionSummary: params.sessionSummary,
    prevCommitId: params.prevCommitId,
    tasksCompleted: params.tasksCompleted ?? 0,
    revenueAttempted: params.revenueAttempted ?? 0,
    metadata: params.metadata ?? {},
  };
}
