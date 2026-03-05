/**
 * Server entrypoint — runs the Hono REST API
 */
import * as dotenv from "dotenv";
dotenv.config();

import { serve } from "@hono/node-server";
import app from "./server.js";

const port = parseInt(process.env.PORT ?? "3000", 10);

serve({ fetch: app.fetch, port });

console.log(`🚀 Persistent — Aurora AI Agent API`);
console.log(`   Running on: http://localhost:${port}`);
console.log(`   Health: http://localhost:${port}/health`);
console.log(`   Submit task: POST http://localhost:${port}/tasks`);
console.log(`   View memory: GET http://localhost:${port}/memory`);
console.log(`   Stats: GET http://localhost:${port}/stats`);
console.log(`   Network: ${process.env.HEDERA_NETWORK ?? "testnet"}`);
console.log(`   Memory topic: ${process.env.HEDERA_MEMORY_TOPIC_ID ?? "(not configured — run init)"}`);
