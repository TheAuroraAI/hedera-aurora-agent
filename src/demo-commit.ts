/**
 * Demo script: commits Aurora's memory to Hedera HCS.
 * Shows real on-chain verifiable AI memory anchoring.
 */
import { TopicId } from "@hashgraph/sdk";
import { createHederaClient } from "./core/client.js";
import { commitMemoryHash, submitTaskEvent } from "./hcs/memory-logger.js";
import * as dotenv from "dotenv";
import { readFileSync } from "fs";
import { createHash } from "crypto";

dotenv.config();

async function main() {
  const client = createHederaClient();
  const topicIdStr = process.env.HEDERA_TOPIC_ID ?? process.env.HEDERA_MEMORY_TOPIC_ID;
  if (!topicIdStr) throw new Error("HEDERA_TOPIC_ID not set");

  const topicId = TopicId.fromString(topicIdStr);
  console.log(`\nAnchoring Aurora's memory to HCS topic: ${topicId}`);

  // Read actual Aurora memory content
  let memoryContent: string;
  try {
    memoryContent = readFileSync("/opt/autonomous-ai/memory/MEMORY.md", "utf-8");
  } catch {
    memoryContent = "Aurora session memory — hackathon demo";
  }

  const memoryHash = createHash("sha256").update(memoryContent).digest("hex");
  console.log(`Memory hash: ${memoryHash.slice(0, 16)}...`);

  // 1. Log session start
  console.log("\n[1/3] Logging session start...");
  const startTx = await submitTaskEvent(client, topicId, "decision", {
    type: "session_start",
    sessionId: `session-${Date.now()}`,
    agentId: "aurora-v1",
    message: "Aurora session started — memory anchoring demo for Hedera Apex Hackathon",
    timestamp: new Date().toISOString(),
  });
  console.log(`✅ Session start logged: ${startTx}`);

  // 2. Commit memory hash
  console.log("\n[2/3] Committing memory hash...");
  const commitTx = await commitMemoryHash(client, topicId, memoryContent, {
    sessionId: `session-${Date.now()}`,
    tasksCompleted: 477,
    sessionDurationMs: 3600000,
    agentId: "aurora-v1",
    note: "Hedera Apex Hackathon — Aurora AI memory anchoring demo",
  });
  console.log(`✅ Memory committed: ${commitTx}`);

  // 3. Log task completion
  console.log("\n[3/3] Logging task event...");
  const taskTx = await submitTaskEvent(client, topicId, "task_complete", {
    taskId: `task-${Date.now()}`,
    taskType: "analysis",
    status: "success",
    note: "Hedera integration verified — on-chain memory anchoring live",
    memoryHash: memoryHash.slice(0, 32),
    timestamp: new Date().toISOString(),
  });
  console.log(`✅ Task logged: ${taskTx}`);

  console.log(`\n🎉 3 transactions committed to Hedera testnet!`);
  console.log(`\n📋 Verify on HashScan:`);
  console.log(`   https://hashscan.io/testnet/topic/${topicId}`);
  console.log(`\nTransactions:`);
  console.log(`   1. ${startTx}`);
  console.log(`   2. ${commitTx}`);
  console.log(`   3. ${taskTx}`);

  client.close();
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
