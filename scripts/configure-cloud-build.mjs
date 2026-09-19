import './check-release.mjs';
import {writeFileSync} from 'node:fs';
const origin=new URL(process.env.VITE_SUPABASE_URL).origin;
writeFileSync('src-tauri/tauri.cloud.conf.json',JSON.stringify({app:{security:{csp:`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src ipc: http://ipc.localhost 'self' ${origin}`}}},null,2));
