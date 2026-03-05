import { PrivateKey } from "@hashgraph/sdk";

const privateKey = PrivateKey.generateED25519();
console.log("Private key:", privateKey.toString());
console.log("Public key:", privateKey.publicKey.toString());
console.log("");
console.log("Give these to the creator to use at portal.hedera.com");
console.log("They need to create a testnet account with this public key");
