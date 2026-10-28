import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorldState } from '../src/state/WorldState.ts';
import { CheckResolver } from '../src/engine/CheckResolver.ts';
import { ConditionEvaluator, FunctionRegistry } from '../src/engine/eval.ts';
import { startGame, createGameContext } from '../src/engine/context.ts';
import { ALL_SKILLS } from '../src/adapters/disco/builds.ts';

for (const isred of [0, 1]) {
  for (const [rolls, difficulty, expected] of [[[3,4],14,true], [[3,4],15,false], [[1,1],1,false], [[6,6],99,true]]) {
    test(`check red=${isred} dice=${rolls} difficulty=${difficulty}`, () => {
      const state = new WorldState(); state.skillValues.set('Logic', 5);
      const resolver = new CheckResolver(state, new ConditionEvaluator(new FunctionRegistry()), () => [
        {variable:'', modifier:2, tooltip:''}, {variable:'false', modifier:100, tooltip:''}
      ]);
      const original = Math.random; let i = 0;
      Math.random = () => (rolls[i++] - 0.5) / 6;
      try {
        const result = resolver.resolve({skilltype:'Logic',difficulty,isred,flagname:'passed'}, 1, 0);
        assert.equal(result.passed, expected); assert.equal(result.total, rolls[0]+rolls[1]+7);
        assert.equal(state.getVar('passed'), expected);
      } finally { Math.random = original; }
    });
  }
}
test('save roundtrip preserves build and custom skill values; old saves use balanced', () => {
  const state = new WorldState(); state.initSkills('thinker', ALL_SKILLS); state.skillValues.set('Logic',9);
  const restored = new WorldState(); restored.restore(JSON.parse(JSON.stringify(state.snapshot())));
  assert.equal(restored.build, 'thinker'); assert.equal(restored.getSkill('Logic'),9);
  const old = state.snapshot(); delete old.build; delete old.skillValues;
  restored.restore(old); assert.equal(restored.build,'balanced'); assert.equal(restored.getSkill('Logic'),3);
});
test('scene entry preserves state, skills and history; explicit reset clears progress', () => {
  const ctx = createGameContext(process.env.DISCO_DB ?? 'data/disco.db', '/tmp/disco-test-unused-saves');
  ctx.state.setVar('test.continuity',42); ctx.state.initSkills('thinker',ALL_SKILLS);
  ctx.state.money=73; ctx.state.inventory.add('test-item'); ctx.state.party.delete('kim');
  ctx.engine.history.push({type:'info',message:'previous scene'});
  startGame(ctx,142); startGame(ctx,1274);
  assert.equal(ctx.state.getVar('test.continuity'),42); assert.equal(ctx.state.money,73);
  assert.equal(ctx.state.build,'thinker'); assert.equal(ctx.state.getSkill('Logic'),5);
  assert.equal(ctx.state.party.has('kim'),false);
  assert(ctx.engine.history.some(e=>e.message==='previous scene'));
  startGame(ctx,142,true,'physical');
  assert.equal(ctx.state.getVar('test.continuity'),false); assert.equal(ctx.state.money,0);
  assert.equal(ctx.state.inventory.has('test-item'),false); assert.equal(ctx.state.build,'physical');
  assert(!ctx.engine.history.some(e=>e.message==='previous scene'));
});
