// Assembles the Capacitor web root (www/) from the curated game files only,
// so docs/, tests/, node_modules/ never ship inside the app.
// www/ is BUILD OUTPUT — never edit it by hand; edit index.html / src/ and re-run.
import { rmSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';

rmSync('www', { recursive: true, force: true });
mkdirSync('www', { recursive: true });
cpSync('index.html', 'www/index.html');
cpSync('src', 'www/src', { recursive: true });
writeFileSync(
  'www/DO_NOT_EDIT.txt',
  'Build output of scripts/assemble-web.mjs. Do not edit by hand; edit index.html / src/ instead.\n',
);
console.log('Assembled www/ from index.html + src/ (build output — do not edit by hand).');
