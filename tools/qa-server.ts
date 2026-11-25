import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'academy-browser-'));
const instance=createApp({dataDir});
const server=instance.app.listen(3101,'127.0.0.1',()=>console.log('QA http://127.0.0.1:3101 · isolated database'));
const close=()=>server.close(()=>{instance.close();process.exit(0)});
process.on('SIGTERM',close);process.on('SIGINT',close);
