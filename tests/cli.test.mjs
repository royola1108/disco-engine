import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WebSocket } from 'ws';
import { TokenManager } from '../src/engine/TokenManager.ts';
const exec = promisify(execFile);
test('CLI start, scene change, save/load and reset through REST', async () => {
  const dir = await mkdtemp(join(tmpdir(),'disco-cli-'));
  const token = 'tiny';
  const otherToken = 'another-player';
  await writeFile(join(dir,'tokens.txt'),token+'\n'+otherToken+'\n');
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
  let savePath;
  try {
    let ready=false;
    for(let i=0;i<100;i++) {
      try { const r=await fetch(env.DISCO_SERVER); if(r.ok) {ready=true;break;} } catch {}
      await new Promise(r=>setTimeout(r,50));
    }
    assert(ready,`isolated server started: ${errors}`);
    assert.match(await cli('start','142','--reset','--build=thinker'),/Character build: thinker/);
    savePath=join(dir,'saves',new TokenManager(join(dir,'tokens.txt')).playerId(token),'test.json');
    await cli('save','test');
    const before=JSON.parse(await readFile(savePath,'utf8'));
    before.state.variables['test.continuity']=42;
    before.state.skillValues.Logic=9;
    await writeFile(savePath,JSON.stringify(before)); await cli('load','test');
    await cli('start','1274'); await cli('save','test');
    const after=JSON.parse(await readFile(savePath,'utf8'));
    assert.equal(after.state.variables['test.continuity'],42);
    assert.equal(after.state.build,'thinker'); assert.equal(after.state.skillValues.Logic,9);
    const tm = new TokenManager(join(dir,'tokens.txt'));
    const ownId=tm.playerId(token), otherId=tm.playerId(otherToken);
    const request=async(tool,args,t=token)=>fetch(`${env.DISCO_SERVER}/api/${tool}`,{
      method:'POST',headers:{'X-Auth-Token':t,'Content-Type':'application/json'},body:JSON.stringify(args)
    });
    await request('status',{},otherToken);
    const listing=await (await request('players',{})).text();
    assert(listing.includes(ownId));assert(!listing.includes(otherId));assert(!listing.includes(token));
    for (const tool of ['save','load']) {
      const response=await request(tool,{slot:'../outside'});assert.equal(response.status,400);
    }
    const wsBase=env.DISCO_SERVER.replace('http:','ws:')+'/ws';
    await new Promise((resolve,reject)=>{
      const ws=new WebSocket(`${wsBase}?token=${token}&player=${ownId}`);
      ws.on('message',data=>{try {assert.equal(JSON.parse(data).playerId,ownId);ws.close();resolve();}catch(e){ws.close();reject(e);}});
      ws.on('error',reject);
    });
    for(const query of [`token=${token}&player=${otherId}`,'token=invalid']) {
      await new Promise((resolve,reject)=>{
        const ws=new WebSocket(`${wsBase}?${query}`);
        ws.on('unexpected-response',(_req,res)=>{res.resume();try{assert.equal(res.statusCode,401);resolve();}catch(e){reject(e);} ws.terminate();});
        ws.on('open',()=>{ws.close();reject(new Error('Unauthorized observer connected'));});
        ws.on('error',()=>{});
      });
    }
    await cli('reset'); await cli('save','test');
    const reset=JSON.parse(await readFile(savePath,'utf8'));
    assert.equal(reset.state.build,'balanced'); assert.equal(reset.state.variables['test.continuity'],undefined);
  } finally {
    if(child.exitCode === null) { const exited=new Promise(r=>child.once('exit',r)); child.kill(); await exited; } await rm(dir,{recursive:true,force:true});
  }
});
