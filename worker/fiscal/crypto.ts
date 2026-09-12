import crypto from "node:crypto";

const ECF_KEY_PREFIX = "ecf-v1:";
const ECF_KEY_PATTERN = /^ecf-v1:([A-Za-z0-9_-]{43})$/;

export function resolveRequiredEcfEncryptionKey(env: Pick<NodeJS.ProcessEnv, "ECF_ENCRYPTION_KEY"> = process.env): string {
  const encryptionKey = env.ECF_ENCRYPTION_KEY?.trim();
  if (!encryptionKey) {
    throw new Error("ECF_ENCRYPTION_KEY is required before decrypting protected fiscal certificate material.");
  }
  const match = encryptionKey.match(ECF_KEY_PATTERN);
  if (!match) {
    throw new Error("ECF_ENCRYPTION_KEY must use the ecf-v1:<base64url-32-byte-key> format.");
  }
  const key = Buffer.from(match[1], "base64url");
  if (key.byteLength !== 32 || key.every((byte) => byte === key[0])) {
    throw new Error("ECF_ENCRYPTION_KEY must contain 32 non-uniform cryptographic key bytes.");
  }
  return encryptionKey;
}

function decodeEcfEncryptionKey(secretKey: string): Buffer {
  const match = resolveRequiredEcfEncryptionKey({ ECF_ENCRYPTION_KEY: secretKey }).match(ECF_KEY_PATTERN);
  return Buffer.from(match![1], "base64url");
}

export function decryptPassphrase(encryptedStr: string, secretKeyStr: string): string {
  const key = decodeEcfEncryptionKey(secretKeyStr);

  if (!encryptedStr || !encryptedStr.startsWith("aes256gcm:")) {
    // If not encrypted (legacy migration / local test), use as plaintext.
    return encryptedStr;
  }
  const parts = encryptedStr.split(":");
  if (parts.length !== 4) throw new Error("Invalid encrypted passphrase format");
  const iv = Buffer.from(parts[1], "hex");
  const tag = Buffer.from(parts[2], "hex");
  const ciphertext = Buffer.from(parts[3], "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
