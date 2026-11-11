import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { P12Reader } from "npm:dgii-ecf";
import forge from "npm:node-forge@1.3.1";
import { formatDistinguishedName } from "./distinguishedName.ts";
import { ECF_ENVIRONMENTS, buildCertificateRows } from "./certificateRows.ts";

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
  constructor(readonly status: number, message: string, readonly code: string = "INVALID_REQUEST") {
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
  if (!match) throw new HttpError(401, "Authentication is required.", "UNAUTHENTICATED");
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
    if (authError || !authData.user) throw new HttpError(401, "Invalid authentication token.", "UNAUTHENTICATED");

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
      throw new HttpError(403, "You are not authorized to manage this tenant certificate.", "FORBIDDEN");
    }

    const { data: fileData, error: downloadError } = await admin.storage.from("fiscal_certificates").download(storagePath);
    if (downloadError || !fileData) throw new HttpError(500, "Could not download certificate.", "DOWNLOAD_FAILED");

    const bytes = new Uint8Array(await fileData.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    // A rejected upload is removed so it does not linger in the bucket. Only objects in this
    // tenant's folder are deleted, and never the object the metadata currently points to (the
    // stored certificate). Failure to delete is non-fatal and the original error is still returned.
    const rejectUpload = async (message: string, code: string): Promise<never> => {
      try {
        const { data: current } = await admin
          .from("ecf_certificate_metadata")
          .select("storage_ref")
          .eq("tenant_id", tenantId)
          .eq("environment", environment)
          .maybeSingle();
        const currentRef = typeof current?.storage_ref === "string" ? current.storage_ref : null;
        if (storagePath.startsWith(`${tenantId}/`) && storagePath !== currentRef) {
          const { error: cleanupError } = await admin.storage.from("fiscal_certificates").remove([storagePath]);
          if (cleanupError) console.warn("validate-ecf-certificate: could not delete the rejected upload.");
        }
      } catch {
        console.warn("validate-ecf-certificate: could not delete the rejected upload.");
      }
      throw new HttpError(400, message, code);
    };

    let certInfo: ReturnType<P12Reader["getCertificateInfoFromBase64"]>;
    try {
      certInfo = new P12Reader(passphrase).getCertificateInfoFromBase64(btoa(binary));
    } catch (parseError) {
      // Never echo parser details: they may include file internals. Classify only.
      const text = parseError instanceof Error ? parseError.message : "";
      if (/mac could not be verified|invalid password|passphrase|password/i.test(text)) {
        return await rejectUpload("La contraseña del certificado es incorrecta.", "WRONG_PASSWORD");
      }
      return await rejectUpload("El archivo no es un certificado .p12 válido.", "INVALID_FILE");
    }
    // dgii-ecf prints `undefined=` for OIDs without a short name; re-read the names with readable
    // labels. Any failure keeps the library strings, so validation behavior is unchanged.
    let subjectText = certInfo.subject;
    let issuerText = certInfo.issuer;
    try {
      const pem = new P12Reader(passphrase).getKeyFromStringBase64(btoa(binary)).cert;
      if (pem) {
        const parsed = forge.pki.certificateFromPem(pem);
        subjectText = formatDistinguishedName(parsed.subject.attributes) || subjectText;
        issuerText = formatDistinguishedName(parsed.issuer.attributes) || issuerText;
      }
    } catch {
      // keep the library-provided strings
    }
    if (!certInfo.subject || !certInfo.validTo) {
      return await rejectUpload("El archivo no es un certificado .p12 válido.", "INVALID_FILE");
    }
    if (new Date() > new Date(certInfo.validTo)) {
      return await rejectUpload("El certificado digital se encuentra vencido.", "CERTIFICATE_EXPIRED");
    }

    const encryptedPassphrase = await encryptPassphrase(passphrase, requiredEnv("ECF_ENCRYPTION_KEY"));
    // Read previous object references across environments before replacement.
    const { data: previousRows } = await admin
      .from("ecf_certificate_metadata")
      .select("storage_ref")
      .eq("tenant_id", tenantId)
      .in("environment", ECF_ENVIRONMENTS);
    const existingRefs = (previousRows ?? [])
      .map((row) => (typeof row?.storage_ref === "string" ? row.storage_ref : null))
      .filter((ref): ref is string => !!ref);
    const previousRefs = Array.from(
      new Set(
        existingRefs.filter((ref) => ref !== storagePath && ref.startsWith(`${tenantId}/`)),
      ),
    );

    const certificateRows = buildCertificateRows({
      tenant_id: tenantId,
      subject: subjectText,
      issuer: issuerText,
      serial_number: certInfo.serialNumber,
      valid_from: certInfo.validFrom,
      valid_until: certInfo.validTo,
      storage_ref: storagePath,
      password_encrypted: encryptedPassphrase,
      is_ready: true,
      last_validation_error: null,
    });

    // One upsert for all environments: the same validated certificate serves test, certification and production.
    const { error: insertError } = await admin
      .from("ecf_certificate_metadata")
      .upsert(certificateRows, { onConflict: "tenant_id,environment" });
    if (insertError) {
      // Validation passed but the metadata was not saved: the new object would be orphaned. Remove it
      // (tenant folder only, never the stored certificate). Non-fatal; SAVE_FAILED is always returned.
      try {
        if (storagePath.startsWith(`${tenantId}/`) && !existingRefs.includes(storagePath)) {
          const { error: cleanupError } = await admin.storage.from("fiscal_certificates").remove([storagePath]);
          if (cleanupError) console.warn("validate-ecf-certificate: could not delete the unsaved upload.");
        }
      } catch {
        console.warn("validate-ecf-certificate: could not delete the unsaved upload.");
      }
      throw new HttpError(500, "Could not save certificate metadata.", "SAVE_FAILED");
    }

    // The new certificate is validated and saved across all environments: remove replaced storage objects
    // only if NO remaining ecf_certificate_metadata row of any tenant still references it after the upsert.
    // Only objects in this tenant's folder are ever deleted. Failure is non-fatal and logged without secrets.
    for (const replacedRef of previousRefs) {
      if (replacedRef && replacedRef !== storagePath && replacedRef.startsWith(`${tenantId}/`)) {
        try {
          const { data: stillReferenced, error: checkError } = await admin
            .from("ecf_certificate_metadata")
            .select("id")
            .eq("storage_ref", replacedRef)
            .limit(1);
          if (!checkError && (!stillReferenced || stillReferenced.length === 0)) {
            const { error: removeError } = await admin.storage.from("fiscal_certificates").remove([replacedRef]);
            if (removeError) console.warn("validate-ecf-certificate: could not delete the previous certificate object.");
          }
        } catch {
          console.warn("validate-ecf-certificate: could not delete the previous certificate object.");
        }
      }
    }

    return Response.json({ success: true, subject: subjectText, environment, environments: [...ECF_ENVIRONMENTS] }, { headers: corsHeaders });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : "Certificate validation failed.";
    const code = error instanceof HttpError ? error.code : "INTERNAL";
    return Response.json({ error: message, code }, { status, headers: corsHeaders });
  }
});
