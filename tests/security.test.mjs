import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,stat,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {TokenManager} from '../src/engine/TokenManager.ts';
import {SaveStore} from '../src/state/SaveStore.ts';
import {WorldState} from '../src/state/WorldState.ts';

test('player IDs hide even short tokens, survive restart and distinguish shared prefixes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'disco-id-'));
 try {
  const path=join(dir,'tokens.txt');await writeFile(path,'tiny\nabcdefghijkl-A\nabcdefghijkl-B\n');
  const tm=new TokenManager(path);const id=tm.playerId('tiny');
  assert.match(id,/^[a-f0-9]{64}$/);assert(!id.includes('tiny'));
  assert.equal(new TokenManager(path).playerId('tiny'),id);
  assert.notEqual(tm.playerId('abcdefghijkl-A'),tm.playerId('abcdefghijkl-B'));
  assert.equal((await stat(path+'.player-key')).mode & 0o777,0o600);
  await rm(path);assert.equal(tm.valid('tiny'),false);
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('legacy save migration preserves files and refuses ambiguous ownership before moving anything',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'disco-migrate-'));
 try {
  const path=join(dir,'tokens.txt');await writeFile(path,'tiny\n');
  const saves=join(dir,'saves');await mkdir(join(saves,'tiny'),{recursive:true});
  await writeFile(join(saves,'tiny','auto.json'),'saved progress');
  const tm=new TokenManager(path);tm.migrateSaves(saves);
  assert.equal(await readFile(join(saves,tm.playerId('tiny'),'auto.json'),'utf8'),'saved progress');
  tm.migrateSaves(saves);
  await writeFile(path,'unmigrated\nabcdefghijkl-A\nabcdefghijkl-B\n');
  await mkdir(join(saves,'unmigrated'));await mkdir(join(saves,'abcdefghijkl'));
  assert.throws(()=>new TokenManager(path).migrateSaves(saves),/Ambiguous/);
  assert((await stat(join(saves,'unmigrated'))).isDirectory());
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('every save operation rejects traversal and invalid slot names; normal roundtrip works',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'disco-slots-'));
 try {
  const store=new SaveStore(join(dir,'saves'));const state=new WorldState().snapshot();
  await writeFile(join(dir,'outside.json'),'do not change');
  for(const slot of ['../outside','..','a/b','a\\b','%2e%2e%2foutside','/outside','','x'.repeat(101),null,42]) {
   await assert.rejects(store.save(slot,state,1,0),/Invalid save slot/);
   await assert.rejects(store.load(slot),/Invalid save slot/);
   await assert.rejects(store.delete(slot),/Invalid save slot/);
  }
  assert.equal(await readFile(join(dir,'outside.json'),'utf8'),'do not change');
  await store.save('chapter-1_ok',state,142,3);
  assert.equal((await store.load('chapter-1_ok')).currentDlg,3);
  await store.delete('chapter-1_ok');assert.equal(await store.load('chapter-1_ok'),null);
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('slash-bearing tokens work without legacy saves; nested legacy saves require manual migration',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'disco-token-format-'));
 try {
  const path=join(dir,'tokens.txt'),saves=join(dir,'saves');
  const token='abc/defghijklmnopqrst';await writeFile(path,token+'\n');
  const tm=new TokenManager(path);
  assert(tm.valid(token));tm.migrateSaves(saves);
  await mkdir(saves);tm.migrateSaves(saves);
  const id=tm.playerId(token);assert.match(id,/^[a-f0-9]{64}$/);
  assert.equal(new TokenManager(path).playerId(token),id);
  const legacy=join(saves,token.slice(0,12));await mkdir(legacy,{recursive:true});
  await writeFile(join(legacy,'auto.json'),'legacy progress');
  assert.throws(()=>tm.migrateSaves(saves),/manual migration/);
  assert.equal(await readFile(join(legacy,'auto.json'),'utf8'),'legacy progress');
  await writeFile(path,'../outside\n');
  await mkdir(join(dir,'outside'));await writeFile(join(dir,'outside','auto.json'),'outside sentinel');
  new TokenManager(path).migrateSaves(saves);
  assert.equal(await readFile(join(dir,'outside','auto.json'),'utf8'),'outside sentinel');
 } finally {await rm(dir,{recursive:true,force:true});}
});
