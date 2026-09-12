import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { P12Reader } from "npm:dgii-ecf";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const tenantPathPattern = new RegExp(
  "^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/[^/]+\\.p12$",
  "i",
);
const ecfKeyPattern = /^ecf-v1:([A-Za-z0-9_-]{43})$/;

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function decodeEcfEncryptionKey(value: string): Uint8Array {
  const match = value.match(ecfKeyPattern);
  if (!match) throw new Error("ECF_ENCRYPTION_KEY must use the ecf-v1:<base64url-32-byte-key> format.");
  const base64 = match[1].replace(/-/g, "+").replace(/_/g, "/") + "=";
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  if (bytes.byteLength !== 32 || bytes.every((byte) => byte === bytes[0])) {
    throw new Error("ECF_ENCRYPTION_KEY must contain 32 non-uniform cryptographic key bytes.");
  }
  return bytes;
}

function getBearerToken(req: Request): string {
  const authorization = req.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError(401, "Authentication is required.");
  return match[1];
}

function tenantIdFromStoragePath(storagePath: unknown): string {
  if (typeof storagePath !== "string") {
    throw new HttpError(400, "storage_path is required.");
  }

  const match = storagePath.match(tenantPathPattern);
  if (!match) {
    throw new HttpError(400, "storage_path must be a tenant-scoped .p12 object.");
  }
  return match[1].toLowerCase();
}

function validateRequestPayload(payload: unknown): { environment: string; storagePath: string; passphrase: string } {
  if (!payload || typeof payload !== "object") throw new HttpError(400, "Invalid request body.");
  const { environment, storage_path: storagePath, passphrase } = payload as Record<string, unknown>;
  if (typeof environment !== "string" || !environment.trim() || environment.length > 64) {
    throw new HttpError(400, "environment is required.");
  }
  if (typeof passphrase !== "string" || !passphrase) {
    throw new HttpError(400, "passphrase is required.");
  }
  if (typeof storagePath !== "string") {
    throw new HttpError(400, "storage_path is required.");
  }
  return { environment: environment.trim(), storagePath, passphrase };
}

async function encryptPassphrase(passphrase: string, secretKey: string): Promise<string> {
  const keyBytes = decodeEcfEncryptionKey(secretKey);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(passphrase)));
  const tag = encrypted.slice(-16);
  const ciphertext = encrypted.slice(0, -16);
  const toHex = (buffer: Uint8Array) => Array.from(buffer).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `aes256gcm:${toHex(iv)}:${toHex(tag)}:${toHex(ciphertext)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const token = getBearerToken(req);
    const authClient = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_PUBLISHABLE_KEY"), {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) throw new HttpError(401, "Invalid authentication token.");

    const { environment, storagePath, passphrase } = validateRequestPayload(await req.json());
    // The tenant is derived from the only storage namespace this function accepts.
    const tenantId = tenantIdFromStoragePath(storagePath);
    // This client exists only after the caller has a verified, non-privileged Auth identity.
    const admin = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: membership, error: membershipError } = await admin
      .from("tenant_users")
      .select("rol")
      .eq("tenant_id", tenantId)
      .eq("auth_user_id", authData.user.id)
      .eq("activo", true)
      .maybeSingle();

    if (membershipError) throw new Error("Could not verify tenant authorization.");
    if (!membership || !["admin", "super_admin"].includes(membership.rol)) {
      throw new HttpError(403, "You are not authorized to manage this tenant certificate.");
    }

    const { data: fileData, error: downloadError } = await admin.storage.from("fiscal_certificates").download(storagePath);
    if (downloadError || !fileData) throw new Error("Could not download certificate.");

    const bytes = new Uint8Array(await fileData.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const certInfo = new P12Reader(passphrase).getCertificateInfoFromBase64(btoa(binary));
    if (!certInfo.subject || !certInfo.validTo) throw new HttpError(400, "Invalid certificate or passphrase.");
    if (new Date() > new Date(certInfo.validTo)) throw new HttpError(400, "El certificado digital se encuentra vencido.");

    const encryptedPassphrase = await encryptPassphrase(passphrase, requiredEnv("ECF_ENCRYPTION_KEY"));
    const { error: insertError } = await admin.from("ecf_certificate_metadata").upsert({
      tenant_id: tenantId,
      environment,
      subject: certInfo.subject,
      issuer: certInfo.issuer,
      serial_number: certInfo.serialNumber,
      valid_from: certInfo.validFrom,
      valid_until: certInfo.validTo,
      storage_ref: storagePath,
      password_encrypted: encryptedPassphrase,
      is_ready: true,
    }, { onConflict: "tenant_id,environment" });
    if (insertError) throw new Error("Could not save certificate metadata.");

    return Response.json({ success: true, subject: certInfo.subject }, { headers: corsHeaders });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : "Certificate validation failed.";
    return Response.json({ error: message }, { status, headers: corsHeaders });
  }
});
