import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const envDefines = {
  DEV_FIREBASE_API_KEY: 'DEV_FIREBASE_API_KEY',
  DEV_FIREBASE_AUTH_DOMAIN: 'DEV_FIREBASE_AUTH_DOMAIN',
  DEV_FIREBASE_PROJECT_ID: 'DEV_FIREBASE_PROJECT_ID',
  DEV_FIREBASE_STORAGE_BUCKET: 'DEV_FIREBASE_STORAGE_BUCKET',
  DEV_FIREBASE_MESSAGING_SENDER_ID: 'DEV_FIREBASE_MESSAGING_SENDER_ID',
  DEV_FIREBASE_APP_ID: 'DEV_FIREBASE_APP_ID',
  DEV_FIREBASE_MEASUREMENT_ID: 'DEV_FIREBASE_MEASUREMENT_ID',
  DEV_FIREBASE_FIRESTORE_DATABASE_ID: 'DEV_FIREBASE_FIRESTORE_DATABASE_ID'
};

const command = process.argv[2];
const extraArgs = process.argv.slice(3);
const missing = Object.values(envDefines).filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(`Missing dev Firebase env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const defineArgs = Object.entries(envDefines).map(([identifier, envName]) => {
  return `--define=${identifier}=${JSON.stringify(process.env[envName])}`;
});

const ngArgsByCommand = {
  build: ['build', '--configuration', 'development,dev'],
  serve: ['serve', '--build-target', 'app:build:development,dev']
};

const ngArgs = ngArgsByCommand[command];

if (!ngArgs) {
  console.error('Usage: node scripts/angular-dev.mjs <build|serve> [angular args...]');
  process.exit(1);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, '..');
const ngExecutable = process.execPath;
const ngCli = resolve(workspaceRoot, 'node_modules/@angular/cli/bin/ng.js');

const child = spawn(ngExecutable, [ngCli, ...ngArgs, ...defineArgs, ...extraArgs], {
  cwd: workspaceRoot,
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Angular CLI exited from signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
