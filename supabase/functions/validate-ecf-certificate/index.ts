// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { P12Reader } from "npm:dgii-ecf"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
        password_encrypted: passphrase, // Note: In a real app this should be encrypted via pgsodium/vault
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
