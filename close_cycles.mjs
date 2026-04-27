import { createClient } from "@insforge/sdk";
import fs from "fs";

// Leer .env
const env = fs.readFileSync(".env", "utf-8");
const urlMatch = env.match(/VITE_INSFORGE_BASE_URL=(.+)/);
const keyMatch = env.match(/VITE_INSFORGE_ANON_KEY=(.+)/);

if (!urlMatch || !keyMatch) {
  console.error("No se encontró la URL o KEY en .env");
  process.exit(1);
}

const supabase = createClient({ baseUrl: urlMatch[1].trim(), anonKey: keyMatch[1].trim() });

async function run() {
  const { data, error } = await supabase.database
    .from("cierres_operativos")
    .select("id")
    .is("closed_at", null);
  
  if (error) {
    console.error("Error consultando:", error);
  } else {
    console.log("Ciclos abiertos restantes:", data.length);
  }
}

run();
