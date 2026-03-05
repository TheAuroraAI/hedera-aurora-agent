/**
 * Vitest global test setup — runs before any test file loads.
 * Sets environment variables needed by all tests.
 */
process.env.HEDERA_ACCOUNT_ID = "0.0.1234";
process.env.HEDERA_PRIVATE_KEY = "302e020100300506032b657004220420" + "a".repeat(64);
process.env.HEDERA_KEY_TYPE = "ED25519";
process.env.HEDERA_NETWORK = "testnet";
process.env.HEDERA_TOPIC_ID = "0.0.5000";
process.env.HEDERA_MEMORY_TOPIC_ID = "0.0.5000";
process.env.LLM_API_KEY = "test-key-not-used";
process.env.LLM_BASE_URL = "https://api.groq.com/openai/v1";
process.env.LLM_MODEL = "llama-3.3-70b-versatile";
process.env.PORT = "0";
