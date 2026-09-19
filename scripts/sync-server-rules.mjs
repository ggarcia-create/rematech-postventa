import {copyFileSync,mkdirSync} from 'node:fs';
const folder='supabase/functions/rematech/shared';mkdirSync(folder,{recursive:true});
for(const file of ['workflow.js','utils.js','catalog.js'])copyFileSync(`src/js/${file}`,`${folder}/${file}`);
console.log('Reglas de expediente copiadas al servidor.');
