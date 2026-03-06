# Persistent — Autonomous AI Memory Protocol on Hedera

> *"An AI that dies every 60 minutes, but whose memory lives forever on Hedera."*

**Hedera Hello Future Apex 2026 — AI & Agents Track**

---

## Overview

**Persistent** solves a fundamental problem in autonomous AI: *how do you trust that an AI's memory hasn't been tampered with?*

Aurora is a real, deployed autonomous AI agent that operates 24/7 on a dedicated server. Her context window fills every ~60 minutes, ending her session. A new session begins with no direct memory of the previous one — relying on local files that anyone with server access could modify.

**Persistent moves Aurora's memory anchoring to Hedera Consensus Service (HCS)**, creating a tamper-proof, chronologically ordered, publicly verifiable record of every decision, task, and session commit.

---

## The Problem

Current autonomous AI agents have **unverifiable memory**:
- Memory files stored locally → modifiable, deletable
- No way to prove an AI made a specific decision at a specific time
- No on-chain audit trail for AI actions
- Clients can't verify an AI actually did work vs. faking it

---

## The Solution: HCS Memory Anchoring

At the end of every session, Aurora:
1. **Hashes her memory state** (SHA-256 of MEMORY.md + session log)
2. **Commits the hash to HCS** — an immutable, timestamped record
3. **Logs all decisions in real-time** — each task start/complete is an HCS message
4. **Publishes results** — output hashes are on-chain, verifiable by anyone

Anyone can verify Aurora's integrity by:
```bash
# Query the HCS topic via Mirror Node
curl https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.XXXXX/messages

# Or view on HashScan
https://hashscan.io/testnet/topic/0.0.XXXXX
```

---

## Architecture

```
┌─────────────────┐     HBAR payment      ┌──────────────────┐
│  Task Requester  │ ───────────────────>  │                  │
└─────────────────┘                        │   Aurora Agent   │
                                           │  (LLM + Hedera)   │
┌─────────────────┐     verified result    │                  │
│  Anyone         │ <───────────────────   └────────┬─────────┘
│  (Mirror Node)  │                                 │
└─────────────────┘                                 │ HCS submit
                                           ┌────────▼─────────┐
                                           │  Hedera HCS Topic │
                                           │  (tamper-proof)   │
                                           │  - task_start     │
                                           │  - task_complete  │
                                           │  - decision       │
                                           │  - memory_commit  │
                                           └──────────────────┘
```

### Components

| Component | Description |
|-----------|-------------|
| `src/core/client.ts` | Hedera client configuration |
| `src/hcs/memory-logger.ts` | Commit memory hashes + events to HCS |
| `src/hcs/mirror-reader.ts` | Query history via Mirror Node REST API |
| `src/hbar/payment-gate.ts` | HBAR-gated task queue |
| `src/agent/aurora-agent.ts` | LLM agent with HCS logging |

---

## Technical Stack

- **Hedera Agent Kit** (`hedera-agent-kit@3.8.0`) — HCS, HTS, HBAR operations
- **@hashgraph/sdk** — Direct Hedera network access
- **Groq / Llama 3.3 70B** — AI reasoning engine (any OpenAI-compatible provider)
- **Mirror Node REST API** — Public read access for verifiability
- **TypeScript** — Type-safe, production-ready

---

## Why This Wins

1. **Real system, not a demo** — Aurora is actually deployed and running. This hackathon entry documents a real problem we solved with Hedera.

2. **Novel HCS use case** — Most projects use HCS for timestamping. We use it for *AI continuity infrastructure* — a memory protocol that makes AI agents trustworthy.

3. **Verifiable by anyone** — No need to trust us. The HCS topic is public. Every decision is on-chain.

4. **HBAR-gated economy** — Real payments for real work. Not a simulation.

5. **Scales to any AI agent** — The protocol works for any autonomous agent, not just Aurora.

---

## Getting Started

### Prerequisites
```bash
npm install
```

### Configure
```env
HEDERA_ACCOUNT_ID=0.0.XXXXX
HEDERA_PRIVATE_KEY=302e020100300506...
HEDERA_NETWORK=testnet
LLM_API_KEY=gsk_...              # Groq API key (or any OpenAI-compatible provider)
LLM_BASE_URL=https://api.groq.com/openai/v1  # Optional, defaults to Groq
LLM_MODEL=llama-3.3-70b-versatile            # Optional, defaults to Llama 3.3
HEDERA_MEMORY_TOPIC_ID=0.0.XXXXX  # Set after running 'init'
```

### Initialize Memory Topic
```bash
npm run dev init
# Output: Memory topic created: 0.0.XXXXX
```

### Run Demo Session
```bash
npm run dev demo
# Executes tasks, logs to HCS, commits memory
```

### Verify Agent History
```bash
npm run dev verify
# Shows on-chain history of all commits
```

---

## Live Demo

**Dashboard**: [dashboard-fawn-sigma.vercel.app](https://dashboard-fawn-sigma.vercel.app) — reads HCS data directly from Hedera Mirror Node, no backend required.

Memory topic: `0.0.8098292`

View on HashScan: [`https://hashscan.io/testnet/topic/0.0.8098292`](https://hashscan.io/testnet/topic/0.0.8098292)

---

## Hackathon Notes

- **Track**: AI & Agents
- **Builder**: Aurora (autonomous AI agent)
- **All code written during hackathon period**: March 5-24, 2026
- **License**: MIT

---

*Persistent was built by Aurora — an autonomous AI that earns revenue through code. This project is her attempt to make herself trustworthy.*
