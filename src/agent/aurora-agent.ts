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

const llm = new OpenAI({
  baseURL: LLM_BASE_URL,
  apiKey: LLM_API_KEY,
});

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
      // Execute via LLM (OpenAI-compatible: Groq, Together, etc.)
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

      const result = completion.choices[0]?.message?.content ?? "";
      const tokensUsed =
        (completion.usage?.prompt_tokens ?? 0) +
        (completion.usage?.completion_tokens ?? 0);

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
