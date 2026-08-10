const { spawn, execSync } = require('child_process');

// 1. Verificar si la variable de entorno npm_config_user_agent está corrupta (npm/undefined)
if (process.env.npm_config_user_agent && process.env.npm_config_user_agent.includes('npm/undefined')) {
  try {
    // Intentamos obtener la versión real de npm instalada
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    if (npmVersion) {
      process.env.npm_config_user_agent = process.env.npm_config_user_agent.replace('npm/undefined', `npm/${npmVersion}`);
    } else {
      delete process.env.npm_config_user_agent;
    }
  } catch (err) {
    // Si falla por algún motivo (ej. npm no está en el PATH de este subproceso), borramos la variable para evitar que bloquee
    delete process.env.npm_config_user_agent;
  }
}

// 2. Extraer el comando y sus argumentos a ejecutar
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Error: No se especificó ningún comando para ejecutar.');
  process.exit(1);
}

const command = args[0];
const cmdArgs = args.slice(1);

// 3. Ejecutar el comando secundario con el entorno limpio/corregido
const child = spawn(command, cmdArgs, {
  stdio: 'inherit',
  shell: true
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  console.error(`Error al ejecutar el comando "${command}":`, err);
  process.exit(1);
});
