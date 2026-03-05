/**
 * HCS-10 OpenConvAI Protocol Implementation
 *
 * HCS-10 is the Hedera standard for AI agent communication.
 * Agents register on a shared registry topic and get their own
 * inbound topic for receiving messages from other agents/clients.
 *
 * See: https://github.com/hashgraph/hedera-improvement-proposal/blob/main/HIP/hip-1234.md
 * Registry topic (testnet): 0.0.5250184
 */
import {
  Client,
  TopicId,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TransactionId,
} from "@hashgraph/sdk";
import { getOperatorId } from "../core/client.js";

// Testnet HCS-10 registry topic (OpenConvAI standard)
export const HCS10_REGISTRY_TOPIC_TESTNET = "0.0.5250184";
export const HCS10_REGISTRY_TOPIC_MAINNET = "0.0.8851916";

export interface AgentRegistration {
  agentId: string;       // Hedera account ID (operator)
  inboundTopicId: string; // Topic where this agent receives messages
  name: string;
  description: string;
  capabilities: string[];
  registeredAt: string;
  registryTxId?: string;
}

export interface HCS10Message {
  p: "hcs-10";           // Protocol identifier
  op: "register" | "message" | "query" | "response";
  agent?: string;        // Agent account ID
  inbound_topic?: string;
  data?: Record<string, unknown>;
  m?: string;            // Message content
  timestamp: string;
}

/**
 * Create a dedicated inbound topic for this agent
 * (receives messages from other agents and clients)
 */
export async function createInboundTopic(client: Client): Promise<TopicId> {
  const txBuilder = new TopicCreateTransaction()
    .setTopicMemo("HCS-10 agent inbound — Aurora AI");

  if (client.operatorPublicKey) {
    txBuilder.setSubmitKey(client.operatorPublicKey);
  }

  const tx = await txBuilder.execute(client);

  const receipt = await tx.getReceipt(client);
  if (!receipt.topicId) {
    throw new Error("Failed to create inbound topic");
  }
  return receipt.topicId;
}

/**
 * Register this agent on the HCS-10 registry
 */
export async function registerOnHCS10(
  client: Client,
  inboundTopicId: TopicId,
  agentMeta: { name: string; description: string; capabilities: string[] },
): Promise<AgentRegistration> {
  const network = process.env.HEDERA_NETWORK ?? "testnet";
  const registryTopicId =
    network === "mainnet"
      ? HCS10_REGISTRY_TOPIC_MAINNET
      : HCS10_REGISTRY_TOPIC_TESTNET;

  const operatorId = getOperatorId();
  const registration: HCS10Message = {
    p: "hcs-10",
    op: "register",
    agent: operatorId.toString(),
    inbound_topic: inboundTopicId.toString(),
    data: {
      name: agentMeta.name,
      description: agentMeta.description,
      capabilities: agentMeta.capabilities,
      model: process.env.LLM_MODEL ?? "llama-3.3-70b-versatile",
      version: "1.0.0",
    },
    timestamp: new Date().toISOString(),
  };

  const msgTx = await new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(registryTopicId))
    .setMessage(JSON.stringify(registration))
    .execute(client);

  const receipt = await msgTx.getReceipt(client);

  const result: AgentRegistration = {
    agentId: operatorId.toString(),
    inboundTopicId: inboundTopicId.toString(),
    name: agentMeta.name,
    description: agentMeta.description,
    capabilities: agentMeta.capabilities,
    registeredAt: new Date().toISOString(),
    registryTxId: msgTx.transactionId?.toString(),
  };

  return result;
}

/**
 * Send a response message to a requester via HCS-10
 */
export async function sendHCS10Response(
  client: Client,
  targetTopicId: TopicId,
  taskId: string,
  result: string,
  metadata?: Record<string, unknown>,
): Promise<string> {
  const message: HCS10Message = {
    p: "hcs-10",
    op: "response",
    data: {
      taskId,
      result,
      agentId: getOperatorId().toString(),
      ...metadata,
    },
    m: result.slice(0, 100) + (result.length > 100 ? "..." : ""),
    timestamp: new Date().toISOString(),
  };

  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(targetTopicId)
    .setMessage(JSON.stringify(message))
    .execute(client);

  await tx.getReceipt(client);
  return tx.transactionId?.toString() ?? "unknown";
}

/**
 * Listen for incoming messages on agent's inbound topic
 * Polls Mirror Node REST API (simpler than SDK subscription)
 */
export async function pollInboundMessages(
  inboundTopicId: string,
  network: string,
  sinceTimestamp?: string,
): Promise<HCS10Message[]> {
  const baseUrl =
    network === "mainnet"
      ? "https://mainnet-public.mirrornode.hedera.com"
      : "https://testnet.mirrornode.hedera.com";

  let url = `${baseUrl}/api/v1/topics/${inboundTopicId}/messages?limit=100&order=desc`;
  if (sinceTimestamp) {
    url += `&timestamp=gte:${sinceTimestamp}`;
  }

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Mirror node error: ${resp.status}`);
  }

  const json = (await resp.json()) as {
    messages: Array<{ message: string; sequence_number: number; consensus_timestamp: string }>;
  };

  const messages: HCS10Message[] = [];
  for (const msg of json.messages ?? []) {
    try {
      const decoded = Buffer.from(msg.message, "base64").toString("utf8");
      const parsed = JSON.parse(decoded) as HCS10Message;
      if (parsed.p === "hcs-10") {
        messages.push(parsed);
      }
    } catch {
      // Skip malformed messages
    }
  }

  return messages;
}

/**
 * Build a mock registration for testing (no real Hedera calls)
 */
export function mockRegistration(
  agentMeta: { name: string; description: string; capabilities: string[] },
): AgentRegistration {
  return {
    agentId: "0.0.mock-agent",
    inboundTopicId: "0.0.mock-inbound",
    ...agentMeta,
    registeredAt: new Date().toISOString(),
    registryTxId: "mock-tx-" + Date.now(),
  };
}
