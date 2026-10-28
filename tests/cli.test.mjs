import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
const exec = promisify(execFile);
test('CLI start, scene change, save/load and reset through REST', async () => {
  const dir = await mkdtemp(join(tmpdir(),'disco-cli-'));
  const token = randomBytes(24).toString('hex');
  await writeFile(join(dir,'tokens.txt'),token+'\n');
  await copyFile('skills/disco-elysium/scripts/disco',join(dir,'disco.cjs'));
  const env = {...process.env, HOME:dir, DISCO_DB:process.env.DISCO_DB ?? resolve('data/disco.db'), DISCO_MODE:'both', DISCO_PORT:'0', DISCO_TOKENS:join(dir,'tokens.txt'), DISCO_SAVES:join(dir,'saves')};
  // Reserve a local test port; never call the public game server.
  const { createServer } = await import('node:net');
  const probe=createServer(); await new Promise(r=>probe.listen(0,'127.0.0.1',r));
  env.DISCO_PORT=String(probe.address().port); await new Promise(r=>probe.close(r));
  env.DISCO_SERVER=`http://127.0.0.1:${env.DISCO_PORT}`; env.DISCO_TOKEN=token;
  const child=spawn(process.execPath,['--import','tsx',resolve('src/index.ts')],{env,stdio:['ignore','ignore','pipe']});
  let errors=''; child.stderr.on('data',chunk=>{errors+=chunk;});
  const cli=async(...args)=>(await exec(process.execPath,[join(dir,'disco.cjs'),...args],{env})).stdout;
  const savePath=join(dir,'saves',token.slice(0,12),'test.json');
  try {
    let ready=false;
    for(let i=0;i<100;i++) {
      try { const r=await fetch(env.DISCO_SERVER); if(r.ok) {ready=true;break;} } catch {}
      await new Promise(r=>setTimeout(r,50));
    }
    assert(ready,`isolated server started: ${errors}`);
    assert.match(await cli('start','142','--reset','--build=thinker'),/Character build: thinker/);
    await cli('save','test');
    const before=JSON.parse(await readFile(savePath,'utf8'));
    before.state.variables['test.continuity']=42;
    before.state.skillValues.Logic=9;
    await writeFile(savePath,JSON.stringify(before)); await cli('load','test');
    await cli('start','1274'); await cli('save','test');
    const after=JSON.parse(await readFile(savePath,'utf8'));
    assert.equal(after.state.variables['test.continuity'],42);
    assert.equal(after.state.build,'thinker'); assert.equal(after.state.skillValues.Logic,9);
    await cli('reset'); await cli('save','test');
    const reset=JSON.parse(await readFile(savePath,'utf8'));
    assert.equal(reset.state.build,'balanced'); assert.equal(reset.state.variables['test.continuity'],undefined);
  } finally {
    if(child.exitCode === null) { const exited=new Promise(r=>child.once('exit',r)); child.kill(); await exited; } await rm(dir,{recursive:true,force:true});
  }
});
