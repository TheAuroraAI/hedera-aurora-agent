/**
 * One-time setup script: creates the HCS memory topic and prints the topic ID.
 * Run once, then save the HEDERA_TOPIC_ID to .env.
 */
import { createHederaClient } from "../core/client.js";
import { createMemoryTopic } from "./memory-logger.js";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  if (process.env.HEDERA_TOPIC_ID) {
    console.log(`Topic already configured: ${process.env.HEDERA_TOPIC_ID}`);
    console.log("Delete HEDERA_TOPIC_ID from .env to create a new one.");
    return;
  }

  console.log("Creating HCS memory topic on Hedera testnet...");
  const client = createHederaClient();

  try {
    const topicId = await createMemoryTopic(client, "aurora");
    console.log(`\n✅ HCS Topic created: ${topicId}`);
    console.log(`\nAdd to your .env file:`);
    console.log(`HEDERA_TOPIC_ID=${topicId}`);
    console.log(`\nView on HashScan: https://hashscan.io/testnet/topic/${topicId}`);
  } finally {
    client.close();
  }
}

main().catch((e) => {
  console.error("Failed to create topic:", e.message);
  process.exit(1);
});
