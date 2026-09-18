import test from 'node:test';
import assert from 'node:assert/strict';
import {SiegeGame,TOWER_RANGE} from '../src/game.js';
test('tower attacks inside two spacings and excludes targets outside range',()=>{
 const g=new SiegeGame(()=>.5);g.state='playing';g.spawnLeft=0;g.setTower(10,0,0);
 g.enemies=[{id:1,x:TOWER_RANGE-1,z:0,hp:100,maxHp:100,speed:0,cooldown:100,type:'soldier'}];
 for(let i=0;i<40;i++)g.step(.05);
 assert.ok(g.enemies[0].hp<100);
 const h=new SiegeGame();h.state='playing';h.setTower(10,0,0);h.enemies=[{id:1,x:TOWER_RANGE+1,z:0,hp:100,speed:0,cooldown:100,type:'soldier'}];
 for(let i=0;i<40;i++)h.step(.05);
 assert.equal(h.enemies[0].hp,100);assert.equal(h.projectiles.length,0);
});
test('spawns from all four sides and includes archers and soldiers',()=>{
 const g=new SiegeGame(()=>.5);for(let i=0;i<4;i++)g.spawn();
 assert.deepEqual(g.enemies.map(e=>[e.x,e.z]),[[0,-185],[140,0],[0,185],[-140,0]]);
 assert.ok(g.enemies.some(e=>e.type==='archer'));assert.ok(g.enemies.some(e=>e.type==='soldier'));
});
test('inactive tower does not fire and pre-start simulation does not run',()=>{
 const g=new SiegeGame();g.setTower(10,0,0,false);g.spawn();g.step(.05);assert.equal(g.time,0);
 g.state='playing';g.enemies[0].x=40;g.enemies[0].z=0;for(let i=0;i<50;i++)g.step(.05);assert.equal(g.projectiles.filter(p=>!p.hostile).length,0);
});
test('castle can take damage, lose, reset, and win after sixth wave',()=>{
 const g=new SiegeGame();g.state='playing';g.hp=1;g.enemies=[{id:1,x:25,z:0,hp:100,type:'soldier',cooldown:0,speed:0}];g.step(.05);
 assert.equal(g.state,'defeat');assert.equal(g.hp,0);g.reset();assert.equal(g.hp,1000);assert.equal(g.enemies.length,0);
 g.state='playing';g.wave=6;g.breakTimer=5;g.step(.05);assert.equal(g.state,'victory');
});
