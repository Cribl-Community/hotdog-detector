import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(resolve(root, 'goattown.config.yaml'), 'utf8');
// Standalone validation requires a producer, but app proposals are owned by
// the app credential. Compile the reviewable source without that field.
const proposal = source.replace(/^producer:\s*[^\r\n]*\r?\n/m, '');
if (proposal === source) throw new Error('Expected producer field in goattown.config.yaml');
const generated = `// Generated from goattown.config.yaml by scripts/compile-goattown-config.mjs.\nexport const configurationYaml = ${JSON.stringify(proposal)};\n`;
const destination = resolve(root, 'src/goattown/configuration.generated.ts');
await writeFile(destination, generated, 'utf8');
