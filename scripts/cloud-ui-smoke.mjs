import {readFileSync} from 'node:fs';
import {webkit,chromium,expect} from '@playwright/test';
const keys=JSON.parse(readFileSync('/tmp/rematech-project-keys.json','utf8'));
const key=keys.find(k=>k.name==='service_role').api_key;
const url='https://gxhlrxiiuqlfmjrwllif.supabase.co';
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
async function call(path,body,method=body?'POST':'GET'){const r=await fetch(url+path,{method,headers,body:body?JSON.stringify(body):undefined});const text=await r.text();if(!r.ok)throw Error(`QA setup failed ${r.status}`);return text?JSON.parse(text):null;}
for(const [name,engine] of [['Chromium',chromium],['WebKit',webkit]]){
 const email=`qa-ui-${crypto.randomUUID()}@rematech.test`,password=`QA-${crypto.randomUUID()}`;
 const account=await call('/auth/v1/admin/users',{email,password,email_confirm:true});
 let browser;
 try{
  await call('/rest/v1/rematech_profiles',{id:account.id,email,name:'QA Interfaz',role:'admin',must_change_password:true});
  browser=await engine.launch();const page=await browser.newPage({viewport:{width:1500,height:1000}});
  await page.goto('http://127.0.0.1:1421');
  await page.locator('#login-email').fill(email);await page.locator('#login-password').fill(password);await page.locator('#login-submit').click();
  await expect(page.locator('#password-change-dialog')).toBeVisible({timeout:20000});
  await page.locator('#new-account-password').fill(password);await page.locator('#confirm-account-password').fill(password);await page.locator('#password-change-form button[type="submit"]').click();
  await expect(page.locator('#password-change-error')).toContainText('distinta',{timeout:20000});
  await page.locator('#new-account-password').fill('Changed-'+password);await page.locator('#confirm-account-password').fill('Changed-'+password);await page.locator('#password-change-form button[type="submit"]').click();
  await expect(page.locator('#application')).toBeVisible({timeout:20000});
  await page.locator('#manage-users').click();await expect(page.locator('#users-list')).toContainText('QA Interfaz',{timeout:20000});
  await page.locator('#close-users').click();await page.locator('#logout').click();
  await page.locator('#login-password').fill('Changed-'+password);await page.locator('#login-submit').click();await expect(page.locator('#application')).toBeVisible({timeout:20000});
  console.log(`PASS ${name}: real shared login, same-password rejection, forced password change, renewed session, administrative query and second login.`);
 }finally{if(browser)await browser.close();await call(`/rest/v1/rematech_profiles?id=eq.${account.id}`,undefined,'DELETE');await call(`/auth/v1/admin/users/${account.id}`,undefined,'DELETE');}
}
