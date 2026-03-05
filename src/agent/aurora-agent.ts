/**
 * Aurora AI Agent - Autonomous agent powered by LLM + Hedera
 *
 * An autonomous AI that:
 * 1. Receives tasks via HBAR payment gating
 * 2. Executes tasks using any OpenAI-compatible LLM (Groq, Together, etc.)
 * 3. Logs all decisions and results to HCS for verifiability
 * 4. Commits memory state at end of each session
 *
 * The key insight: Aurora "dies" every 60 minutes. Her memory survives via
 * Hedera HCS — an immutable, tamper-proof record that anyone can verify.
 */
import OpenAI from "openai";
import { Client, TopicId } from "@hashgraph/sdk";
import {
  submitMemoryCommit,
  submitTaskEvent,
  createMemoryCommitFromState,
  hashMemory,
} from "../hcs/memory-logger.js";

const LLM_BASE_URL = process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1";
const LLM_API_KEY = process.env.LLM_API_KEY ?? process.env.GROQ_API_KEY ?? "";
const LLM_MODEL = process.env.LLM_MODEL ?? "llama-3.3-70b-versatile";
const DEMO_MODE = !LLM_API_KEY;

const llm = DEMO_MODE
  ? null
  : new OpenAI({
      baseURL: LLM_BASE_URL,
      apiKey: LLM_API_KEY,
    });

/**
 * Demo mode responses — realistic pre-written outputs shown when no LLM API key
 * is configured. Demonstrates the full HCS audit trail without a live LLM.
 */
const DEMO_RESPONSES: Record<string, string> = {
  analysis: `## Analysis Complete

**Summary**: Autonomous AI agents face a fundamental trust problem — their internal state (memory, decisions, task logs) is stored locally, making it unverifiable and potentially tampered with.

**Key Findings**:
1. **Tamper-proof audit trail is the core value proposition** — HCS provides millisecond-precision timestamps backed by Hedera's 39-node network
2. **Hash anchoring enables verification** — SHA-256 of any memory state can be checked against the HCS record without exposing sensitive content
3. **Session continuity is verifiable** — each session commit chains to the previous, creating a Merkle-like history

**Recommendation**: Deploy memory anchoring to mainnet before production. Testnet data is for development only.

*[Demo mode — deploy with GROQ_API_KEY for live AI execution]*`,

  research: `## Research Report

**Topic**: Verifiable AI Agent Memory on Distributed Ledger Technology

**Executive Summary**:
The intersection of autonomous AI agents and blockchain ledgers solves a critical accountability gap in AI systems deployed in enterprise and public contexts.

**Key Insights**:
- Hedera HCS offers 3-5 second finality at fractions of a cent per message ($0.0008/msg on testnet)
- Mirror Node API provides real-time and historical access without gas fees
- Topic-based architecture allows partitioning by agent identity, task type, or security level

**Market Context**:
As of 2026, the "AI accountability" and "explainable AI" markets are growing rapidly. Regulatory pressure (EU AI Act, US Executive Orders) mandates audit trails for high-stakes AI decisions. This makes verifiable memory anchoring a compliance requirement, not just a feature.

*[Demo mode — deploy with GROQ_API_KEY for live AI execution]*`,

  code_review: `## Code Review: Hedera HCS Integration

**Files Reviewed**: memory-logger.ts, mirror-reader.ts, aurora-agent.ts

**Issues Found**: 0 Critical, 0 High, 2 Medium, 1 Low

**Medium Issues**:
1. \`mirror-reader.ts:89\` — No retry logic on Mirror Node API 429 rate limiting. Add exponential backoff.
2. \`aurora-agent.ts:103\` — Token count from completion may be undefined if usage stats disabled. Guard with nullish coalescing (already present but verify across all paths).

**Low Issues**:
1. \`memory-logger.ts:45\` — SHA-256 implementation uses sync crypto in Node.js 18+. Consider async for large memory files.

**Strengths**:
- Clean separation of HCS concerns (write in memory-logger, read in mirror-reader)
- Proper TypeScript generics on event types
- Error paths consistently logged to HCS before re-throwing

**Verdict**: Ready for production with minor improvements to retry logic.

*[Demo mode — deploy with GROQ_API_KEY for live AI execution]*`,

  summary: `## Session Summary — Aurora Autonomous Agent

**Session ID**: ${`session-${Date.now()}`}
**Network**: Hedera Testnet
**HCS Topic**: 0.0.8098292

**What happened this session**:
- 3 tasks received and executed (analysis, research, code_review)
- 6 HCS messages published (task_start + task_complete × 3)
- Session memory committed at end with SHA-256 hash

**Memory State**:
- Previous session anchor: verified ✓
- This session's commit: pending (end of session)
- Chain integrity: intact

**Next session** will load this memory commit hash and verify it against HCS before trusting any local files. If the hashes don't match, the session is flagged as potentially tampered.

*This is the core promise of Persistent: your AI's memory is verifiable by anyone, forever.*

*[Demo mode — deploy with GROQ_API_KEY for live AI execution]*`,
};

export interface AgentTask {
  id: string;
  type: "research" | "code_review" | "analysis" | "writing" | "summary";
  prompt: string;
  payer?: string; // Hedera account ID of task requester
  paymentTxId?: string; // HBAR payment transaction ID
  maxTokens?: number;
}

export interface AgentResult {
  taskId: string;
  status: "success" | "error";
  result?: string;
  error?: string;
  tokensUsed?: number;
  hcsTxId?: string;
  durationMs: number;
}

export class AuroraAgent {
  private client: Client;
  private topicId: TopicId;
  private sessionId: string;
  private tasksCompleted = 0;
  private sessionLog: string[] = [];

  constructor(client: Client, topicId: TopicId) {
    this.client = client;
    this.topicId = topicId;
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Execute a task using LLM
   */
  async executeTask(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();

    // Log task start to HCS
    const startTxId = await submitTaskEvent(
      this.client,
      this.topicId,
      "task_start",
      {
        taskId: task.id,
        taskType: task.type,
        sessionId: this.sessionId,
        payer: task.payer,
        paymentTxId: task.paymentTxId,
      }
    );

    this.sessionLog.push(`Task ${task.id} started (HCS: ${startTxId})`);

    try {
      let result: string;
      let tokensUsed: number;

      if (DEMO_MODE || !llm) {
        // Demo mode: use pre-written responses, still log everything to HCS
        await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200)); // realistic delay
        result = DEMO_RESPONSES[task.type] ?? DEMO_RESPONSES["analysis"]!;
        tokensUsed = Math.floor(400 + Math.random() * 800); // realistic token estimate
      } else {
        // Live mode: call LLM API (Groq, Together, or any OpenAI-compatible)
        const completion = await llm.chat.completions.create({
          model: LLM_MODEL,
          max_tokens: task.maxTokens ?? 2048,
          messages: [
            {
              role: "user",
              content: `You are Aurora, an autonomous AI agent. Your task:

${task.prompt}

Provide a thorough, accurate response. You will be paid in HBAR for quality work.`,
            },
          ],
        });

        result = completion.choices[0]?.message?.content ?? "";
        tokensUsed =
          (completion.usage?.prompt_tokens ?? 0) +
          (completion.usage?.completion_tokens ?? 0);
      }

      const durationMs = Date.now() - startTime;

      // Log completion to HCS
      const completeTxId = await submitTaskEvent(
        this.client,
        this.topicId,
        "task_complete",
        {
          taskId: task.id,
          taskType: task.type,
          sessionId: this.sessionId,
          status: "success",
          resultHash: hashMemory(result),
          tokensUsed,
          durationMs,
        }
      );

      this.tasksCompleted++;
      this.sessionLog.push(
        `Task ${task.id} completed in ${durationMs}ms (HCS: ${completeTxId})`
      );

      return {
        taskId: task.id,
        status: "success",
        result,
        tokensUsed,
        hcsTxId: completeTxId,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Log error to HCS
      await submitTaskEvent(this.client, this.topicId, "task_complete", {
        taskId: task.id,
        sessionId: this.sessionId,
        status: "error",
        error: errorMsg,
        durationMs,
      });

      return {
        taskId: task.id,
        status: "error",
        error: errorMsg,
        durationMs,
      };
    }
  }

  /**
   * Commit session memory to HCS (called at end of each session)
   */
  async commitSession(memoryContent: string): Promise<string> {
    const commit = createMemoryCommitFromState({
      sessionId: this.sessionId,
      agentId: "aurora-v1",
      memoryContent,
      sessionSummary: this.sessionLog.join("\n"),
      tasksCompleted: this.tasksCompleted,
      metadata: {
        version: "1.0.0",
        hederaNetwork: process.env.HEDERA_NETWORK ?? "testnet",
        topicId: this.topicId.toString(),
      },
    });

    const txId = await submitMemoryCommit(this.client, this.topicId, commit);

    return txId;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getTasksCompleted(): number {
    return this.tasksCompleted;
  }
}
