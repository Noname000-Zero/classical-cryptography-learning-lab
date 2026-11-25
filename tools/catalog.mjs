import fs from 'node:fs';
// Retain the original local-only importer without publishing its lecture-specific text.
const privateImporter=new URL('./import-catalog.mjs',import.meta.url);
if(fs.existsSync(privateImporter))await import(privateImporter.href);
else await import('./demo-catalog.mjs');
