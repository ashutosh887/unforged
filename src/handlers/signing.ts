import { GetPublicKeyCommand, KMSClient, SignCommand } from "@aws-sdk/client-kms"
import type { Signer } from "../core/receipts.js"
import { env } from "./http.js"

const kms = new KMSClient({})
const pems = new Map<string, Promise<string>>()

export function receiptSigner(): Signer {
  const keyId = env("RECEIPT_KEY_ID")
  return {
    keyId,
    async sign(message) {
      const out = await kms.send(new SignCommand({ KeyId: keyId, Message: message, MessageType: "RAW", SigningAlgorithm: "ECDSA_SHA_256" }))
      if (!out.Signature) throw new Error("KMS returned no signature")
      return out.Signature
    },
  }
}

export function publicKeyPem(keyId = env("RECEIPT_KEY_ID")): Promise<string> {
  let cached = pems.get(keyId)
  if (!cached) {
    cached = kms.send(new GetPublicKeyCommand({ KeyId: keyId })).then((out) => {
      if (!out.PublicKey) throw new Error("KMS returned no public key")
      const b64 = Buffer.from(out.PublicKey).toString("base64").replace(/(.{64})/g, "$1\n").trimEnd()
      return `-----BEGIN PUBLIC KEY-----\n${b64}\n-----END PUBLIC KEY-----\n`
    })
    cached.catch(() => pems.delete(keyId))
    pems.set(keyId, cached)
  }
  return cached
}
