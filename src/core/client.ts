/**
 * Hedera client configuration
 * Supports testnet and mainnet via environment variables
 * Supports both ED25519 and ECDSA key types
 */
import { Client, AccountId, PrivateKey } from "@hashgraph/sdk";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Parse a private key string, auto-detecting ED25519 vs ECDSA.
 * HEDERA_KEY_TYPE env var can be "ED25519" or "ECDSA" to force a type.
 * If not set, attempts ECDSA first (EVM-style 64-char hex), then ED25519.
 */
function parsePrivateKey(keyStr: string): PrivateKey {
  const keyType = (process.env.HEDERA_KEY_TYPE || "").toUpperCase();

  if (keyType === "ECDSA") {
    return PrivateKey.fromStringECDSA(keyStr);
  }
  if (keyType === "ED25519") {
    return PrivateKey.fromStringED25519(keyStr);
  }

  // Auto-detect: raw 64-char hex without DER prefix = ECDSA (EVM-style)
  const stripped = keyStr.startsWith("0x") ? keyStr.slice(2) : keyStr;
  if (/^[0-9a-fA-F]{64}$/.test(stripped)) {
    return PrivateKey.fromStringECDSA(stripped);
  }

  // Fall back to ED25519 (handles DER-encoded keys)
  return PrivateKey.fromStringED25519(keyStr);
}

export function createHederaClient(): Client {
  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const privateKeyStr = process.env.HEDERA_PRIVATE_KEY;
  const network = process.env.HEDERA_NETWORK || "testnet";

  if (!accountId || !privateKeyStr) {
    throw new Error(
      "HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY must be set in environment"
    );
  }

  const client =
    network === "mainnet" ? Client.forMainnet() : Client.forTestnet();

  const operatorId = AccountId.fromString(accountId);
  const operatorKey = parsePrivateKey(privateKeyStr);

  client.setOperator(operatorId, operatorKey);

  return client;
}

export function getOperatorId(): AccountId {
  return AccountId.fromString(process.env.HEDERA_ACCOUNT_ID!);
}

export function getOperatorKey(): PrivateKey {
  return parsePrivateKey(process.env.HEDERA_PRIVATE_KEY!);
}
