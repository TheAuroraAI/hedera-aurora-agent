/**
 * Mirror Node Reader - Query HCS message history without SDK (REST API)
 *
 * Uses Hedera Mirror Node REST API for efficient read-only queries.
 * More efficient than SDK queries for history retrieval.
 */

const MIRROR_ENDPOINTS: Record<string, string> = {
  testnet: "https://testnet.mirrornode.hedera.com/api/v1",
  mainnet: "https://mainnet.mirrornode.hedera.com/api/v1",
};

export interface HCSTopicMessage {
  consensus_timestamp: string;
  message: string; // base64 encoded
  sequence_number: number;
  topic_id: string;
  transaction_id: string;
}

export interface MirrorNodeResponse {
  messages: HCSTopicMessage[];
  links?: { next?: string };
}

/**
 * Fetch all messages from an HCS topic
 */
export async function fetchTopicMessages(
  topicId: string,
  network: "testnet" | "mainnet" = "testnet",
  limit = 100
): Promise<HCSTopicMessage[]> {
  const baseUrl = MIRROR_ENDPOINTS[network];
  const url = `${baseUrl}/topics/${topicId}/messages?limit=${limit}&order=asc`;

  const messages: HCSTopicMessage[] = [];
  let nextUrl: string | undefined = url;

  while (nextUrl) {
    const response = await fetch(nextUrl);
    if (!response.ok) {
      throw new Error(`Mirror node error: ${response.status} ${response.statusText}`);
    }

    const data: MirrorNodeResponse = await response.json();
    messages.push(...data.messages);

    // Handle pagination
    nextUrl = data.links?.next
      ? `${baseUrl}${data.links.next}`
      : undefined;
  }

  return messages;
}

/**
 * Decode a base64-encoded HCS message to JSON
 */
export function decodeMessage(base64Message: string): unknown {
  try {
    const decoded = Buffer.from(base64Message, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Reconstruct agent history from HCS topic messages
 */
export async function reconstructAgentHistory(
  topicId: string,
  network: "testnet" | "mainnet" = "testnet"
): Promise<{
  commits: unknown[];
  tasks: unknown[];
  decisions: unknown[];
  payments: unknown[];
}> {
  const messages = await fetchTopicMessages(topicId, network);

  const history = {
    commits: [] as unknown[],
    tasks: [] as unknown[],
    decisions: [] as unknown[],
    payments: [] as unknown[],
  };

  for (const msg of messages) {
    const decoded = decodeMessage(msg.message);
    if (!decoded || typeof decoded !== "object") continue;

    const typed = decoded as { type?: string; data?: unknown };
    switch (typed.type) {
      case "memory_commit":
        history.commits.push({ ...typed, timestamp: msg.consensus_timestamp });
        break;
      case "task_start":
      case "task_complete":
        history.tasks.push({ ...typed, timestamp: msg.consensus_timestamp });
        break;
      case "decision":
        history.decisions.push({ ...typed, timestamp: msg.consensus_timestamp });
        break;
      case "payment":
        history.payments.push({ ...typed, timestamp: msg.consensus_timestamp });
        break;
    }
  }

  return history;
}

/**
 * Verify that an agent's memory hash matches on-chain record
 */
export async function verifyMemoryIntegrity(
  topicId: string,
  currentMemoryHash: string,
  network: "testnet" | "mainnet" = "testnet"
): Promise<{
  verified: boolean;
  latestCommit?: unknown;
  mismatch?: string;
}> {
  const messages = await fetchTopicMessages(topicId, network, 10);

  // Find most recent memory_commit
  for (let i = messages.length - 1; i >= 0; i--) {
    const decoded = decodeMessage(messages[i].message) as Record<string, unknown> | null;
    if (decoded?.type === "memory_commit") {
      const commitData = decoded.data as { memoryHash?: string } | undefined;
      if (commitData?.memoryHash === currentMemoryHash) {
        return { verified: true, latestCommit: decoded };
      } else {
        return {
          verified: false,
          latestCommit: decoded,
          mismatch: `Expected ${commitData?.memoryHash}, got ${currentMemoryHash}`,
        };
      }
    }
  }

  return { verified: false, mismatch: "No memory commits found on chain" };
}
