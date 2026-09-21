// Prepare only public binaries and the signed updater manifest from a verified CI run.
import {readFileSync,writeFileSync,readdirSync,mkdirSync,copyFileSync} from 'node:fs';
import {join,basename} from 'node:path';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Uso: node scripts/prepare-update-release.mjs CARPETA_ARTEFACTOS CARPETA_PUBLICA');
const version=JSON.parse(readFileSync('package.json','utf8')).version;
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);}
const files=walk(input);
function one(suffix){const found=files.filter(f=>f.endsWith(suffix));if(found.length!==1)throw Error('Debe haber exactamente un archivo '+suffix);return found[0];}
const win=one('-setup.exe'),mac=one('.app.tar.gz'),dmg=one('.dmg');
const artifacts=[['Rematech-Windows.exe',win],['Rematech-Mac.app.tar.gz',mac],['Rematech-Mac.dmg',dmg]];
for(const [,path] of artifacts)if(!basename(path).includes(version)&&path!==mac)throw Error('El artefacto no corresponde a '+version);
const signature=path=>{const s=readFileSync(path+'.sig','utf8').trim();if(!s)throw Error('Falta firma');return s;};
const winSignature=signature(win),macSignature=signature(mac);
mkdirSync(output,{recursive:true});
for(const [name,path] of artifacts)copyFileSync(path,join(output,name));
const url=name=>`https://github.com/ggarcia-create/rematech-postventa-releases/releases/download/v${version}/${name}`;
const manifest={version,notes:'Actualizador integrado. Consulta y descarga nuevas versiones desde el programa.',pub_date:new Date().toISOString(),platforms:{'windows-x86_64':{signature:winSignature,url:url('Rematech-Windows.exe')},'darwin-aarch64':{signature:macSignature,url:url('Rematech-Mac.app.tar.gz')},'darwin-x86_64':{signature:macSignature,url:url('Rematech-Mac.app.tar.gz')}}};
writeFileSync(join(output,'latest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Paquete público ${version} preparado con firmas para Windows y ambas arquitecturas Mac.`);
