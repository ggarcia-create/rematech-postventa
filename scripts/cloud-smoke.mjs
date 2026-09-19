import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const url='https://gxhlrxiiuqlfmjrwllif.supabase.co';
const keys=JSON.parse(readFileSync('/tmp/rematech-project-keys.json','utf8'));
const secret=keys.find(k=>k.name==='service_role').api_key;
const anon=keys.find(k=>k.name==='anon').api_key;
const adminHeaders={apikey:secret,Authorization:`Bearer ${secret}`,'Content-Type':'application/json'};
async function request(path,body,headers=adminHeaders,method='POST'){
 const response=await fetch(url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data=raw;}return {ok:response.ok,status:response.status,data};
}
const accounts=[],caseIds=[];
const pass=`Test-${crypto.randomUUID()}`;
async function make(role,temporary=false){const email=`qa-${role}-${crypto.randomUUID()}@rematech.test`;const result=await request('/auth/v1/admin/users',{email,password:pass,email_confirm:true});assert(result.ok,JSON.stringify(result.data));const id=result.data.id;accounts.push(id);const p=await request('/rest/v1/rematech_profiles',{id,email,name:`QA ${role}`,role,must_change_password:temporary});assert(p.ok,JSON.stringify(p.data));const login=await request('/auth/v1/token?grant_type=password',{email,password:pass},{apikey:anon,'Content-Type':'application/json'});assert(login.ok);return {id,email,token:login.data.access_token};}
const call=(user,action,data={})=>request('/functions/v1/rematech',{action,...data},{apikey:anon,Authorization:`Bearer ${user.token}`,'Content-Type':'application/json'});
try{
 const admin=await make('admin'),intake=await make('ingresos'),repair=await make('reparacion'),quality=await make('calidad',true);
 assert.equal((await call(quality,'list')).status,403);
 assert((await call(quality,'change-password',{password:'Changed-'+pass,confirmation:'Changed-'+pass})).ok);
 const renewed=await request('/auth/v1/token?grant_type=password',{email:quality.email,password:'Changed-'+pass},{apikey:anon,'Content-Type':'application/json'});assert(renewed.ok);quality.token=renewed.data.access_token;
 const {newDraft}=await import('../src/js/utils.js');
 const d={...newDraft(),client:'QA temporal',equipment:'Equipo QA',serial:'QA-SN',description:'Prueba de flujo',components:[{component:'Batería / Carga',faults:['No carga'],other:''}]};
 assert(!(await call(repair,'register',{intake:d,evidence:[]})).ok);
 const created=await call(intake,'register',{intake:d,evidence:[]});assert(created.ok,JSON.stringify(created.data));let r=created.data;caseIds.push(r.id);
 assert((await call(repair,'list')).data.some(x=>x.id===r.id));
 assert((await call(repair,'notifications')).data.some(x=>x.caseId===r.id));
 const act=async(user,operation,payload={})=>{const res=await call(user,'act',{id:r.id,revision:r.revision,operation,payload});assert(res.ok,JSON.stringify(res.data));r=res.data;};
 await act(repair,'receive');
 const t={diagnosis:'Diagnóstico QA',fault:'Falla QA',actions:'Reparación QA',result:'Reparado',faultLocations:['Batería / Carga'],date:'2026-09-19',technician:'Falso'};
 await act(repair,'send-quality',t);assert.equal(r.technical.technician,'QA reparacion');
 assert(!(await call(intake,'act',{id:r.id,revision:r.revision,operation:'finish',payload:{decision:'approved',date:'2026-09-19'}})).ok);
 await act(quality,'return-repair',{decision:'rejected',notes:'Observación QA',date:'2026-09-19'});
 assert((await call(admin,'notifications')).data.some(n=>n.caseId===r.id));
 await act(repair,'send-quality',t);await act(quality,'finish',{decision:'approved',date:'2026-09-19'});assert.equal(r.status,'finalizado');
 const bypass=await request('/rest/v1/rematech_cases?select=id',undefined,{apikey:anon,Authorization:`Bearer ${intake.token}`},'GET');assert(!bypass.ok,'Client must not bypass server permissions');
 console.log('PASS: four independent accounts, temporary password gate, cross-session registration, role guards, repair, rejection, notifications, completion, direct database denied.');
}finally{
 for(const id of caseIds){await request(`/rest/v1/rematech_notification_reads?case_id=eq.${id}`,undefined,adminHeaders,'DELETE');await request(`/rest/v1/rematech_cases?id=eq.${id}`,undefined,adminHeaders,'DELETE');}
 for(const id of accounts){await request(`/rest/v1/rematech_profiles?id=eq.${id}`,undefined,adminHeaders,'DELETE');await request(`/auth/v1/admin/users/${id}`,undefined,adminHeaders,'DELETE');}
}
