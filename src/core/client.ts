/**
 * Hedera client configuration
 * Supports testnet and mainnet via environment variables
 */
import { Client, AccountId, PrivateKey } from "@hashgraph/sdk";
import * as dotenv from "dotenv";

dotenv.config();

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
  const operatorKey = PrivateKey.fromStringED25519(privateKeyStr);

  client.setOperator(operatorId, operatorKey);

  return client;
}

export function getOperatorId(): AccountId {
  return AccountId.fromString(process.env.HEDERA_ACCOUNT_ID!);
}

export function getOperatorKey(): PrivateKey {
  return PrivateKey.fromStringED25519(process.env.HEDERA_PRIVATE_KEY!);
}
