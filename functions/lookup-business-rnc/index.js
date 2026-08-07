const MEGAPLUS_URL = "https://rnc.megaplus.com.do/api/consulta";
const REQUEST_TIMEOUT_MS = 10_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function normalizeRnc(value) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

export default async function lookupBusinessRnc(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ message: "Method not allowed." }, 405);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ message: "El cuerpo de la solicitud debe ser JSON válido." }, 400);
  }

  const rnc = normalizeRnc(payload?.rnc);
  if (rnc.length !== 9) {
    return json({ message: "Ingresá un RNC válido de 9 dígitos." }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(MEGAPLUS_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rnc }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);

    if (response.status === 404 || data?.error) {
      return json({ message: "No encontramos un negocio registrado con ese RNC." }, 404);
    }

    if (!response.ok || !data?.nombre_razon_social) {
      return json({ message: "No pudimos consultar la DGII. Intentá de nuevo o completá los datos manualmente." }, 502);
    }

    return json({
      rnc: data.cedula_rnc ?? rnc,
      legalName: data.nombre_razon_social,
      tradeName: data.nombre_comercial ?? "",
      status: data.estado ?? "",
    }, 200);
  } catch (error) {
    const message = error?.name === "AbortError"
      ? "La consulta tardó demasiado. Intentá de nuevo o completá los datos manualmente."
      : "No pudimos conectar con la DGII. Intentá de nuevo o completá los datos manualmente.";
    return json({ message }, 502);
  } finally {
    clearTimeout(timeout);
  }
};
