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

function frameClock(t,tracker){
 let next=0;const callbacks=new Map();
 const originalRequest=globalThis.requestAnimationFrame,originalCancel=globalThis.cancelAnimationFrame;
 globalThis.requestAnimationFrame=fn=>{callbacks.set(++next,fn);return next;};
 globalThis.cancelAnimationFrame=id=>callbacks.delete(id);
 t.after(()=>{if(originalRequest)globalThis.requestAnimationFrame=originalRequest;else delete globalThis.requestAnimationFrame;if(originalCancel)globalThis.cancelAnimationFrame=originalCancel;else delete globalThis.cancelAnimationFrame;});
 return {callbacks,frame(time=0){const [id,callback]=callbacks.entries().next().value;callbacks.delete(id);callback(time);}};
}
function finish(tracker,message){tracker.complete({...message,tags:[]});}

test('completes each detection before scheduling another, without a 10 Hz timer',t=>{
 const {tracker,messages}=fixture(t),clock=frameClock(t,tracker);
 tracker.start();
 for(let frame=0;frame<60;frame++){
  assert.equal(clock.callbacks.size,1);clock.frame(frame*1000/60);
  assert.equal(clock.callbacks.size,0);assert.equal(tracker.busy,true);
  tracker.schedule();assert.equal(clock.callbacks.size,0);
  finish(tracker,messages.at(-1));
 }
 assert.equal(messages.length,60);assert.equal(clock.callbacks.size,1);
 tracker.stop();assert.equal(clock.callbacks.size,0);
});

test('continues when video-frame callbacks never fire and media time stays at zero',t=>{
 const {tracker,messages}=fixture(t),clock=frameClock(t,tracker);
 tracker.video.requestVideoFrameCallback=()=>{throw new Error('Unreliable video callback must not be used');};
 tracker.video.currentTime=0;tracker.start();
 for(let frame=0;frame<4;frame++){clock.frame(frame*17);finish(tracker,messages.at(-1));}
 assert.equal(messages.length,4);assert.ok(tracker.metrics.hz>0);tracker.stop();
});

test('cancelled callbacks and a late completion cannot restart a stopped loop',t=>{
 const {tracker,messages}=fixture(t),clock=frameClock(t,tracker);
 tracker.start();const stale=[...clock.callbacks.values()][0];tracker.stop();stale();
 assert.equal(messages.length,0);assert.equal(clock.callbacks.size,0);
 tracker.ready=true;tracker.worker={postMessage:data=>messages.push(data),terminate(){}};
 tracker.start();stale();assert.equal(clock.callbacks.size,1);assert.equal(messages.length,0);
 clock.frame();assert.equal(messages.length,1);tracker.stop();finish(tracker,messages[0]);assert.equal(clock.callbacks.size,0);
});

test('waits for usable camera frames without starting detection or losing the loop',t=>{
 const {tracker,messages}=fixture(t),clock=frameClock(t,tracker);
 tracker.video.readyState=1;tracker.start();clock.frame();assert.equal(messages.length,0);assert.equal(clock.callbacks.size,1);
 tracker.video.readyState=2;clock.frame();assert.equal(messages.length,1);assert.equal(clock.callbacks.size,0);tracker.stop();
});

test('small camera movement applies the latest board fit without temporal lag',t=>{
 const {tracker}=fixture(t);const frames=[];tracker.onFrame=frame=>frames.push(frame);
 tracker.markers.set(100,{center_page_mm:[105,148.5],black_square_mm:30});
 const detection=(offset,timestamp)=>({width:640,height:480,timestamp,tags:[{id:100,corners:[[-15,15],[15,15],[15,-15],[-15,-15]].map(([x,y])=>({x:x+300+offset,y:y+240}))}]});
 tracker.receive(detection(0,0));tracker.receive(detection(10,16));
 assert.equal(frames.length,2);assert.ok(Math.abs(frames[1].h[2]/frames[1].h[8]-310)<1e-6);
});

test('uses smaller images only with distributed flow anchors, and refreshes full scans',t=>{
 const {tracker,messages}=fixture(t);let now=1000;t.mock.method(performance,'now',()=>now);
 tracker.flowReady=true;tracker.lastDetection=1000;tracker.scan();assert.equal(messages[0].width,320);assert.equal(messages[0].forceDetect,false);
 tracker.busy=false;now=1310;tracker.scan();assert.equal(messages[1].width,640);assert.equal(messages[1].forceDetect,true);
 tracker.busy=false;tracker.lastDetection=1310;tracker.flowReady=false;tracker.scan();assert.equal(messages[2].width,640);
});

test('recycles returned grayscale storage instead of allocating each scan',t=>{
 const {tracker,messages}=fixture(t);tracker.scan();const buffer=messages[0].gray;
 tracker.complete({...messages[0],tags:[],board:null,gray:buffer});tracker.scan();assert.equal(messages[1].gray,buffer);
 tracker.stop();assert.equal(tracker.grayBuffers.size,0);assert.equal(tracker.captureSurfaces.size,0);
});

test('refreshes depleted anchors early without repeatedly scanning every frame',t=>{
 const {tracker,messages}=fixture(t);let now=1150;t.mock.method(performance,'now',()=>now);
 tracker.flowReady=true;tracker.lastDetection=1000;tracker.trackedPoints=80;
 tracker.scan();assert.equal(messages.at(-1).forceDetect,false);
 tracker.busy=false;tracker.trackedPoints=30;tracker.scan();assert.equal(messages.at(-1).forceDetect,true);
 tracker.busy=false;tracker.lastDetection=now;now+=17;tracker.scan();assert.equal(messages.at(-1).forceDetect,false);
});
