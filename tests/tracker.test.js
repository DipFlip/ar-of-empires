import test from 'node:test';
import assert from 'node:assert/strict';
import { Tracker } from '../src/tracker.js';

function fixture(t){
 const writes={width:0,height:0},messages=[];
 let width=0,height=0;
 const canvas={get width(){return width;},set width(v){width=v;writes.width++;},
  get height(){return height;},set height(v){height=v;writes.height++;},
  getContext(){return {drawImage(){},getImageData(){return {data:new Uint8ClampedArray(width*height*4)};}};}};
 const previous=globalThis.document;
 globalThis.document={createElement:()=>canvas};
 t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
 const tracker=new Tracker({videoWidth:1280,videoHeight:960,readyState:2},{markers:[]},()=>{},()=>{});
 tracker.ready=true;tracker.worker={postMessage:data=>messages.push(data),terminate(){}};
 return {tracker,messages,writes};
}

test('scans fewer pixels, transfers one frame at a time, and reuses canvas dimensions',t=>{
 const {tracker,messages,writes}=fixture(t);
 tracker.scan();tracker.scan();
 assert.equal(messages.length,1);
 assert.equal(messages[0].width,640);assert.equal(messages[0].height,480);
 assert.equal(messages[0].gray.byteLength,640*480);
 tracker.busy=false;tracker.scan();
 assert.equal(messages.length,2);assert.deepEqual(writes,{width:1,height:1});
 assert.ok(messages[1].prepMs>=0);
});

test('retries full resolution after failed acquisition and returns to smaller scans',t=>{
 const {tracker,messages}=fixture(t);
 tracker.misses=3;tracker.scan();assert.equal(messages[0].width,1000);
 tracker.busy=false;tracker.misses=4;tracker.scan();assert.equal(messages[1].width,640);
});

test('paces fast scans to 10 Hz and immediately follows slow results without polling delay',t=>{
 const {tracker}=fixture(t);let delay,callback;
 t.mock.method(globalThis,'setTimeout',(fn,ms)=>{callback=fn;delay=ms;return 1;});
 t.mock.method(globalThis,'clearTimeout',()=>{});
 t.mock.method(performance,'now',()=>250);
 tracker.running=true;tracker.startedAt=200;tracker.schedule();assert.equal(delay,50);
 tracker.startedAt=100;tracker.schedule();assert.equal(delay,0);
 tracker.stop();callback();assert.equal(tracker.busy,false);
});
