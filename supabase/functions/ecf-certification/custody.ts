// Passphrase decryption (WebCrypto only; runs under Deno and vitest). Self-contained copy of the
// custody format written by validate-ecf-certificate (copied from ecf-sign-document; functions are self-contained): `aes256gcm:<iv hex>:<tag hex>:<ciphertext hex>`
// with a key of the form `ecf-v1:<base64url 32 bytes>`. Error messages never include key material.

export class NotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotConfiguredError";
  }
}

const ECF_KEY_PATTERN = /^ecf-v1:([A-Za-z0-9_-]{43})$/;

function fromHex(value: string): Uint8Array {
  if (value.length % 2 !== 0 || /[^0-9a-f]/i.test(value)) throw new Error("Invalid encrypted passphrase format");
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export function decodeEcfEncryptionKey(value: string | undefined): Uint8Array {
  const trimmed = value?.trim();
  if (!trimmed) throw new NotConfiguredError("ECF_ENCRYPTION_KEY is not configured.");
  const match = trimmed.match(ECF_KEY_PATTERN);
  if (!match) throw new NotConfiguredError("ECF_ENCRYPTION_KEY has an invalid format.");
  const base64 = match[1].replace(/-/g, "+").replace(/_/g, "/") + "=";
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  if (bytes.byteLength !== 32 || bytes.every((byte) => byte === bytes[0])) {
    throw new NotConfiguredError("ECF_ENCRYPTION_KEY must contain 32 non-uniform key bytes.");
  }
  return bytes;
}

export async function decryptPassphrase(encrypted: string, encryptionKey: string | undefined): Promise<string> {
  const keyBytes = decodeEcfEncryptionKey(encryptionKey);
  if (!encrypted.startsWith("aes256gcm:")) throw new Error("Unsupported passphrase encoding");
  const parts = encrypted.split(":");
  if (parts.length !== 4) throw new Error("Invalid encrypted passphrase format");
  const iv = fromHex(parts[1]);
  const tag = fromHex(parts[2]);
  const ciphertext = fromHex(parts[3]);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
  const joined = new Uint8Array(ciphertext.length + tag.length);
  joined.set(ciphertext);
  joined.set(tag, ciphertext.length);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, joined);
  return new TextDecoder().decode(plain);
}
