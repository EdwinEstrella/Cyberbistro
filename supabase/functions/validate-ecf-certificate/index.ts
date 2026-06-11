// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { P12Reader } from "npm:dgii-ecf"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function encryptPassphrase(passphrase: string, secretKeyStr: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(secretKeyStr.padEnd(32, '0').slice(0, 32));
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(passphrase)
  );
  const encryptedBytes = new Uint8Array(encrypted);
  const tag = encryptedBytes.slice(-16);
  const ciphertext = encryptedBytes.slice(0, -16);

  const toHex = (buf: Uint8Array) => Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
  return `aes256gcm:${toHex(iv)}:${toHex(tag)}:${toHex(ciphertext)}`;
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { tenant_id, environment, storage_path, passphrase } = await req.json()

    // Download the certificate from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('fiscal_certificates')
      .download(storage_path)

    if (downloadError || !fileData) {
      throw new Error(`Error downloading certificate: ${downloadError?.message}`)
    }

    // Convert Blob to ArrayBuffer to Base64
    const arrayBuffer = await fileData.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    
    // Convert to base64
    let binary = '';
    const len = uint8Array.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const p12Base64 = btoa(binary);

    // Read Certificate Info using dgii-ecf
    const reader = new P12Reader(passphrase)
    const certInfo = reader.getCertificateInfoFromBase64(p12Base64)

    if (!certInfo.subject || !certInfo.validTo) {
      throw new Error("Invalid certificate or passphrase")
    }

    // Encrypt the passphrase before saving to metadata table
    const encryptionKey = Deno.env.get('ECF_ENCRYPTION_KEY') || 'cyberbistro-default-dev-key-32chars';
    const encryptedPassphrase = await encryptPassphrase(passphrase, encryptionKey);

    // Insert metadata into ecf_certificate_metadata
    const { error: insertError } = await supabase
      .from('ecf_certificate_metadata')
      .upsert({
        tenant_id,
        environment,
        subject: certInfo.subject,
        issuer: certInfo.issuer,
        serial_number: certInfo.serialNumber,
        valid_from: certInfo.validFrom,
        valid_until: certInfo.validTo,
        storage_ref: storage_path,
        password_encrypted: encryptedPassphrase,
        is_ready: true
      }, { onConflict: 'tenant_id,environment' })

    if (insertError) {
      throw new Error(`Error saving metadata: ${insertError.message}`)
    }

    // Optionally: Store the passphrase securely in a vault/secret manager 
    // for the Node.js worker to use later when signing.

    return new Response(
      JSON.stringify({ success: true, subject: certInfo.subject }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
