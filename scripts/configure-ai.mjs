import {readFile,writeFile,rename} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const path=fileURLToPath(new URL('../.env',import.meta.url));
const disable=process.argv.includes('--disable');
let content=await readFile(path,'utf8');
function update(key,value){const expression=new RegExp('^'+key+'=.*$','m');content=expression.test(content)?content.replace(expression,()=>key+'='+value):content.trimEnd()+'\n'+key+'='+value+'\n';}
if(disable){update('AI_SUMMARIES_ENABLED','false');}
else {
 let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>4096)throw new Error('Input exceeds the key size limit.');}
 const key=input.trim();if(!/^sk-[A-Za-z0-9_-]{16,}$/.test(key))throw new Error('Invalid API key format. No file was changed.');
 const token=content.match(/^AI_INTERNAL_TOKEN=([a-f0-9]{64})\r?$/m)?.[1]??randomBytes(32).toString('hex');
 update('OPENAI_API_KEY',key);update('AI_INTERNAL_TOKEN',token);update('AI_SUMMARIES_ENABLED','true');
}
const temporary=path+'.ai-setup.tmp';await writeFile(temporary,content,{mode:0o600});await rename(temporary,path);
console.log(disable?'Live AI disabled in .env. Recreate api and ai containers to apply.':'Private AI configuration saved in .env. No API call was made. Recreate api and ai containers to apply.');
