const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

/**
 * Certificate validation and custody are deliberately handled by Electron's
 * OS-backed safeStorage. This endpoint must never receive private material.
 */
module.exports = async function validateEcfCertificate(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      message: "La validación de certificados e-CF se realiza en la aplicación de escritorio.",
    }),
    { status: 410, headers: corsHeaders },
  );
}
