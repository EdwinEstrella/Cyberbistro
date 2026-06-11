import crypto from "node:crypto";

export function decryptPassphrase(encryptedStr: string, secretKeyStr: string): string {
  if (!encryptedStr || !encryptedStr.startsWith("aes256gcm:")) {
    // Si no está cifrada (migración previa / local test), usar como texto plano
    return encryptedStr;
  }
  const parts = encryptedStr.split(":");
  if (parts.length !== 4) throw new Error("Invalid encrypted passphrase format");
  const iv = Buffer.from(parts[1], "hex");
  const tag = Buffer.from(parts[2], "hex");
  const ciphertext = Buffer.from(parts[3], "hex");
  
  const key = Buffer.from(secretKeyStr.padEnd(32, '0').slice(0, 32), "utf8");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}
