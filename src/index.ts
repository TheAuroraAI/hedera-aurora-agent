/**
 * Persistent - Aurora AI Agent on Hedera
 *
 * An autonomous AI that stores verifiable memory on Hedera Consensus Service.
 * Every session is committed to HCS, creating an immutable record of Aurora's
 * decision history that anyone can verify on-chain.
 *
 * Features:
 * - HCS memory commits (tamper-proof session logs)
 * - HBAR-gated task execution (pay to use)
 * - Verifiable AI reasoning (every decision logged to chain)
 * - Multi-session continuity (AI survives context resets via blockchain)
 *
 * Hackathon: Hedera Hello Future Apex 2026 - AI & Agents Track
 */
import * as dotenv from "dotenv";
dotenv.config();

import { TopicId } from "@hashgraph/sdk";
import { createHederaClient } from "./core/client.js";
import { createMemoryTopic, submitTaskEvent } from "./hcs/memory-logger.js";
import { AuroraAgent } from "./agent/aurora-agent.js";
import { reconstructAgentHistory, verifyMemoryIntegrity } from "./hcs/mirror-reader.js";

async function main() {
  console.log("🌟 Persistent — Aurora AI Agent on Hedera");
  console.log("==========================================\n");

  const mode = process.argv[2] || "demo";

  const client = createHederaClient();
  console.log(`✓ Hedera client connected (${process.env.HEDERA_NETWORK ?? "testnet"})`);
  console.log(`✓ Operator: ${process.env.HEDERA_ACCOUNT_ID}\n`);

  if (mode === "init") {
    // Create a new memory topic for this agent
    console.log("Creating memory topic on HCS...");
    const topicId = await createMemoryTopic(client, "aurora-v1");
    console.log(`✓ Memory topic created: ${topicId.toString()}`);
    console.log("\nAdd to your .env file:");
    console.log(`HEDERA_MEMORY_TOPIC_ID=${topicId.toString()}`);

  } else if (mode === "demo") {
    // Run a demo session
    const topicIdStr = process.env.HEDERA_MEMORY_TOPIC_ID;
    if (!topicIdStr) {
      console.error("Error: HEDERA_MEMORY_TOPIC_ID not set. Run with 'init' first.");
      process.exit(1);
    }

    const topicId = TopicId.fromString(topicIdStr);
    const agent = new AuroraAgent(client, topicId);

    console.log(`Session: ${agent.getSessionId()}`);
    console.log(`Memory topic: ${topicId.toString()}\n`);

    // Log session start
    await submitTaskEvent(client, topicId, "decision", {
      type: "session_start",
      sessionId: agent.getSessionId(),
      message: "Aurora session initialized — this moment is now permanent on Hedera",
    });
    console.log("✓ Session start logged to HCS\n");

    // Execute demo tasks
    const tasks = [
      {
        id: "task-001",
        type: "analysis" as const,
        prompt: "Explain in 2 sentences why verifiable AI memory on a blockchain is important for autonomous AI agents.",
      },
      {
        id: "task-002",
        type: "research" as const,
        prompt: "What is Hedera Consensus Service (HCS) and what are its 3 key advantages for AI applications?",
      },
    ];

    for (const task of tasks) {
      console.log(`Executing task: ${task.id} (${task.type})`);
      const result = await agent.executeTask(task);

      if (result.status === "success") {
        console.log(`✓ Completed in ${result.durationMs}ms (HCS: ${result.hcsTxId})`);
        console.log(`  Result: ${result.result?.slice(0, 150)}...`);
      } else {
        console.error(`✗ Failed: ${result.error}`);
      }
      console.log();
    }

    // Commit session memory to HCS
    const mockMemory = `Session ${agent.getSessionId()}\nTasks: ${agent.getTasksCompleted()}\nTimestamp: ${new Date().toISOString()}`;
    console.log("Committing session memory to HCS...");
    const commitTxId = await agent.commitSession(mockMemory);
    console.log(`✓ Memory committed: ${commitTxId}\n`);

    console.log("View on HashScan:");
    console.log(`https://hashscan.io/testnet/topic/${topicId.toString()}`);

  } else if (mode === "verify") {
    const topicIdStr = process.env.HEDERA_MEMORY_TOPIC_ID;
    if (!topicIdStr) {
      console.error("Error: HEDERA_MEMORY_TOPIC_ID not set.");
      process.exit(1);
    }

    console.log(`Fetching history from topic ${topicIdStr}...`);
    const history = await reconstructAgentHistory(topicIdStr, "testnet");

    console.log("\n📊 Agent History:");
    console.log(`  Memory commits: ${history.commits.length}`);
    console.log(`  Tasks: ${history.tasks.length}`);
    console.log(`  Decisions: ${history.decisions.length}`);
    console.log(`  Payments: ${history.payments.length}`);

    if (history.commits.length > 0) {
      console.log("\n🔒 Latest memory commit:");
      const latest = history.commits[history.commits.length - 1] as Record<string, unknown>;
      const data = latest.data as Record<string, unknown> | undefined;
      console.log(`  Hash: ${data?.memoryHash}`);
      console.log(`  Session: ${data?.sessionId}`);
      console.log(`  Tasks completed: ${data?.tasksCompleted}`);
    }
  }

  client.close();
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
