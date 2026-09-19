import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTracking } from '../src/tracking-timings.js';

test('reports slow-tail timings and deadline misses rather than just the latest sample',()=>{
 const samples=Array.from({length:20},(_,i)=>({cycleMs:i<18?15:25,intervalMs:i<18?1000/60:1000/30,readbackMs:i<18?6:12}));
 const summary=summarizeTracking(samples);
 assert.equal(summary.samples,20);assert.deepEqual(summary.cycleMs,{p50:15,p95:25});
 assert.deepEqual(summary.readbackMs,{p50:6,p95:12});assert.equal(summary.overBudgetPercent,10);
 assert.equal(summary.intervalMs.p95,1000/30);
});

test('missing or unsupported timings remain unavailable instead of reporting zero',()=>{
 const summary=summarizeTracking([{drawMs:0,returnMs:undefined},{drawMs:1,returnMs:NaN}]);
 assert.equal(summary.returnMs,undefined);assert.deepEqual(summary.drawMs,{p50:0,p95:1});
 assert.deepEqual(summarizeTracking([]),{samples:0,overBudgetPercent:0});
});
