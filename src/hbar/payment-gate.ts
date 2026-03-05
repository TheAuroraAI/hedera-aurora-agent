/**
 * HBAR Payment Gate - Task escrow and payment verification
 *
 * Clients pay HBAR to request tasks from Aurora.
 * Payment is verified on-chain before task execution begins.
 * This creates a trustless, automated task marketplace.
 */
import {
  Client,
  TransferTransaction,
  AccountId,
  Hbar,
  TransactionId,
} from "@hashgraph/sdk";

export const TASK_PRICES_HBAR: Record<string, number> = {
  research: 1,      // 1 HBAR per research task
  analysis: 2,      // 2 HBAR per analysis task
  code_review: 5,   // 5 HBAR per code review
  writing: 3,       // 3 HBAR per writing task
};

export interface PaymentVerification {
  verified: boolean;
  transactionId?: string;
  amount?: number;
  sender?: string;
  error?: string;
}

/**
 * Transfer HBAR payment for a task
 * Called by client to pay for task execution
 */
export async function payForTask(
  client: Client,
  agentAccountId: string,
  taskType: keyof typeof TASK_PRICES_HBAR
): Promise<string> {
  const amount = TASK_PRICES_HBAR[taskType];
  if (!amount) {
    throw new Error(`Unknown task type: ${taskType}`);
  }

  const tx = new TransferTransaction()
    .addHbarTransfer(
      client.operatorAccountId!.toString(),
      Hbar.fromTinybars(-amount * 100_000_000) // Convert HBAR to tinybars
    )
    .addHbarTransfer(
      agentAccountId,
      Hbar.fromTinybars(amount * 100_000_000)
    );

  const response = await tx.execute(client);
  await response.getReceipt(client);

  return response.transactionId.toString();
}

/**
 * Verify a payment transaction using Mirror Node
 * Returns payment details if valid
 */
export async function verifyPayment(
  transactionId: string,
  expectedRecipient: string,
  minAmountHbar: number,
  network: "testnet" | "mainnet" = "testnet"
): Promise<PaymentVerification> {
  const baseUrl =
    network === "testnet"
      ? "https://testnet.mirrornode.hedera.com/api/v1"
      : "https://mainnet.mirrornode.hedera.com/api/v1";

  try {
    // Normalize transaction ID for mirror node query
    const normalizedId = transactionId.replace("@", "-").replace(".", "-");
    const url = `${baseUrl}/transactions/${normalizedId}`;

    const response = await fetch(url);
    if (!response.ok) {
      return { verified: false, error: `Transaction not found: ${transactionId}` };
    }

    const data = await response.json();
    const transaction = data.transactions?.[0];

    if (!transaction) {
      return { verified: false, error: "Transaction not found in response" };
    }

    // Check recipient and amount from transfers
    let receivedAmount = 0;
    let sender = "";

    for (const transfer of transaction.transfers ?? []) {
      if (
        transfer.account === expectedRecipient &&
        transfer.amount > 0
      ) {
        receivedAmount = transfer.amount / 100_000_000; // tinybars to HBAR
      } else if (transfer.amount < 0) {
        sender = transfer.account;
      }
    }

    if (receivedAmount < minAmountHbar) {
      return {
        verified: false,
        error: `Insufficient payment: ${receivedAmount} HBAR < ${minAmountHbar} HBAR required`,
      };
    }

    return {
      verified: true,
      transactionId,
      amount: receivedAmount,
      sender,
    };
  } catch (error) {
    return {
      verified: false,
      error: `Verification failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
