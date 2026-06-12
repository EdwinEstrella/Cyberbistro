import crypto from "node:crypto";

const DEFAULT_ECF_ENCRYPTION_KEY = "cyberbistro-default-dev-key-32chars";

export function resolveRequiredEcfEncryptionKey(env: Pick<NodeJS.ProcessEnv, "ECF_ENCRYPTION_KEY"> = process.env): string {
  const encryptionKey = env.ECF_ENCRYPTION_KEY?.trim();
  if (!encryptionKey) {
    throw new Error("ECF_ENCRYPTION_KEY is required before decrypting protected fiscal certificate material.");
  }
  if (encryptionKey === DEFAULT_ECF_ENCRYPTION_KEY) {
    throw new Error("Refusing to use default encryption key for fiscal certificate material.");
  }
  return encryptionKey;
}

export function decryptPassphrase(encryptedStr: string, secretKeyStr: string): string {
  const secretKey = resolveRequiredEcfEncryptionKey({ ECF_ENCRYPTION_KEY: secretKeyStr });

  if (!encryptedStr || !encryptedStr.startsWith("aes256gcm:")) {
    // If not encrypted (legacy migration / local test), use as plaintext.
    return encryptedStr;
  }
  const parts = encryptedStr.split(":");
  if (parts.length !== 4) throw new Error("Invalid encrypted passphrase format");
  const iv = Buffer.from(parts[1], "hex");
  const tag = Buffer.from(parts[2], "hex");
  const ciphertext = Buffer.from(parts[3], "hex");

  const key = Buffer.from(secretKey.padEnd(32, "0").slice(0, 32), "utf8");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
