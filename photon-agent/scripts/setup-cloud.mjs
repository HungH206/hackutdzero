// Run from photon-agent/. Creates a dedicated operator identity; sends no messages.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const root = new URL('../', import.meta.url);
const envFile = new URL('.env', root);
let contents = existsSync(envFile) ? readFileSync(envFile, 'utf8') : readFileSync(new URL('.env.example', root), 'utf8');
const get = (name) => contents.split('\n').find((l) => l.startsWith(name+'='))?.slice(name.length+1).trim();
const set = (name,value) => {
 const line = name+'='+value;
 contents = contents.split('\n').some((l)=>l.startsWith(name+'='))
  ? contents.split('\n').map((l)=>l.startsWith(name+'=')?line:l).join('\n') : contents+'\n'+line+'\n';
};
const url = 'https://maincloud.spacetimedb.com';
const db = 'rescuedb';
// Check that the hosted module has the agent schema before provisioning.
execFileSync('spacetime', ['sql','--server','maincloud',db,'SELECT * FROM headcount_summary'], {cwd:root,stdio:['ignore','pipe','pipe']});
if (get('SPACETIME_TOKEN') && (get('SPACETIME_DB') !== db || get('SPACETIME_URL') !== url)) {
 throw new Error('Existing token targets another database. Back up .env and remove SPACETIME_TOKEN before switching to Maincloud.');
}
if (!get('SPACETIME_TOKEN')) {
 const response = await fetch(url+'/v1/identity',{method:'POST',signal:AbortSignal.timeout(15000)});
 if (!response.ok) throw new Error('Could not create agent identity: '+response.status);
 const {identity,token} = await response.json();
 if (typeof identity !== 'string' || typeof token !== 'string') throw new Error('Invalid identity response');
 execFileSync('spacetime',['call',db,'add_operator','--server','maincloud','--',JSON.stringify([identity.startsWith('0x')?identity:'0x'+identity])],{cwd:root,stdio:['ignore','pipe','pipe']});
 set('SPACETIME_TOKEN',token);
}
set('SPACETIME_URL',url);set('SPACETIME_DB',db);
if (!get('ADMIN_TOKEN')) set('ADMIN_TOKEN',randomBytes(32).toString('hex'));
set('PHOTON_SEND_ENABLED','false');
writeFileSync(envFile, contents, {mode:0o600});
console.log('Maincloud agent settings saved privately to .env. Messaging remains disabled. No credentials were printed.');
