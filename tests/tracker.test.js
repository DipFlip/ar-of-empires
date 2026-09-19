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

function videoClock(tracker){
 let next=0;const callbacks=new Map();
 tracker.video.requestVideoFrameCallback=fn=>{callbacks.set(++next,fn);return next;};
 tracker.video.cancelVideoFrameCallback=id=>callbacks.delete(id);
 return {callbacks,frame(time){const [id,callback]=callbacks.entries().next().value;callbacks.delete(id);callback(time*1000,{mediaTime:time});}};
}

test('tracks every available 60 Hz camera frame without a 10 Hz timer',t=>{
 const {tracker,messages}=fixture(t),clock=videoClock(tracker);
 tracker.start();
 for(let frame=0;frame<60;frame++){clock.frame(frame/60);tracker.busy=false;}
 assert.equal(messages.length,60);assert.equal(clock.callbacks.size,1);
 tracker.stop();assert.equal(clock.callbacks.size,0);
});

test('drops busy frames and resumes on fresh input without queuing or duplicate callbacks',t=>{
 const {tracker,messages}=fixture(t),clock=videoClock(tracker);
 tracker.start();tracker.schedule();assert.equal(clock.callbacks.size,1);
 clock.frame(0);clock.frame(1/60);clock.frame(2/60);assert.equal(messages.length,1);
 tracker.busy=false;clock.frame(3/60);assert.equal(messages.length,2);
 tracker.busy=false;clock.frame(3/60);assert.equal(messages.length,2);
 tracker.stop();
});

test('cancelled callbacks cannot restart scanning after stop or a subsequent start',t=>{
 const {tracker,messages}=fixture(t),clock=videoClock(tracker);
 tracker.start();const stale=[...clock.callbacks.values()][0];
 tracker.stop();stale(0,{mediaTime:0});assert.equal(messages.length,0);assert.equal(clock.callbacks.size,0);
 tracker.ready=true;tracker.worker={postMessage:data=>messages.push(data),terminate(){}};
 tracker.start();stale(0,{mediaTime:0});assert.equal(clock.callbacks.size,1);assert.equal(messages.length,0);
 clock.frame(1);assert.equal(messages.length,1);tracker.stop();
});

test('animation-frame fallback skips unchanged video frames and cancels on stop',t=>{
 const {tracker,messages}=fixture(t);let callback,cancelled;
 const originalRequest=globalThis.requestAnimationFrame,originalCancel=globalThis.cancelAnimationFrame;
 globalThis.requestAnimationFrame=fn=>{callback=fn;return 7;};globalThis.cancelAnimationFrame=id=>{cancelled=id;};
 t.after(()=>{if(originalRequest)globalThis.requestAnimationFrame=originalRequest;else delete globalThis.requestAnimationFrame;if(originalCancel)globalThis.cancelAnimationFrame=originalCancel;else delete globalThis.cancelAnimationFrame;});
 tracker.video.currentTime=0;tracker.start();callback(0);tracker.busy=false;
 callback(16);assert.equal(messages.length,1);
 tracker.video.currentTime=1/30;callback(33);assert.equal(messages.length,2);
 tracker.stop();assert.equal(cancelled,7);
});

test('small camera movement applies the latest board fit without temporal lag',t=>{
 const {tracker}=fixture(t);const frames=[];tracker.onFrame=frame=>frames.push(frame);
 tracker.markers.set(100,{center_page_mm:[105,148.5],black_square_mm:30});
 const detection=(offset,timestamp)=>({width:640,height:480,timestamp,tags:[{id:100,corners:[[-15,15],[15,15],[15,-15],[-15,-15]].map(([x,y])=>({x:x+300+offset,y:y+240}))}]});
 tracker.receive(detection(0,0));tracker.receive(detection(10,16));
 assert.equal(frames.length,2);assert.ok(Math.abs(frames[1].h[2]/frames[1].h[8]-310)<1e-6);
});
