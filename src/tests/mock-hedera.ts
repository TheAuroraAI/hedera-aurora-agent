/**
 * Mock Hedera SDK for testing
 * Simulates all HCS operations without real network calls
 */

export interface MockTopicId {
  toString(): string;
  shard: number;
  realm: number;
  num: number;
}

export interface MockTransactionId {
  toString(): string;
}

export interface MockTransactionReceipt {
  topicId: MockTopicId | null;
  status: { toString(): string };
}

// Counter for generating unique mock topic IDs
let mockTopicCounter = 1000;
let mockTxCounter = 1;

export function createMockTopicId(num?: number): MockTopicId {
  const n = num ?? mockTopicCounter++;
  return {
    toString: () => `0.0.${n}`,
    shard: 0,
    realm: 0,
    num: n,
  };
}

export function createMockTxId(): MockTransactionId {
  return {
    toString: () => `0.0.1234@${Date.now()}.${mockTxCounter++}`,
  };
}

// Track submitted messages for test assertions
const _submittedMessages: Array<{
  topicId: string;
  message: string;
  timestamp: number;
}> = [];

export function getSubmittedMessages() {
  return [..._submittedMessages];
}

export function clearSubmittedMessages() {
  _submittedMessages.length = 0;
}

// Mock Hedera Client
export class MockHederaClient {
  readonly operatorPublicKey = {
    toString: () => "mock-public-key-ed25519",
  };

  close(): void {}
}

// Mock TopicCreateTransaction
export class MockTopicCreateTransaction {
  private _memo = "";
  private _submitKey: unknown = null;

  setTopicMemo(memo: string): this {
    this._memo = memo;
    return this;
  }

  setSubmitKey(key: unknown): this {
    this._submitKey = key;
    return this;
  }

  async execute(_client: MockHederaClient): Promise<{
    getReceipt: () => Promise<MockTransactionReceipt>;
    transactionId: MockTransactionId;
  }> {
    const topicId = createMockTopicId();
    return {
      getReceipt: async () => ({
        topicId,
        status: { toString: () => "SUCCESS" },
      }),
      transactionId: createMockTxId(),
    };
  }
}

// Mock TopicMessageSubmitTransaction
export class MockTopicMessageSubmitTransaction {
  private _topicId: MockTopicId | null = null;
  private _message = "";

  setTopicId(topicId: MockTopicId | { toString(): string }): this {
    this._topicId = topicId as MockTopicId;
    return this;
  }

  setMessage(message: string): this {
    this._message = message;
    return this;
  }

  async execute(_client: MockHederaClient): Promise<{
    getReceipt: () => Promise<MockTransactionReceipt>;
    transactionId: MockTransactionId;
  }> {
    // Track the message for test assertions
    _submittedMessages.push({
      topicId: this._topicId?.toString() ?? "unknown",
      message: this._message,
      timestamp: Date.now(),
    });

    return {
      getReceipt: async () => ({
        topicId: null,
        status: { toString: () => "SUCCESS" },
      }),
      transactionId: createMockTxId(),
    };
  }
}
