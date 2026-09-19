import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardFlow,robustBoard,spreadPoints } from '../src/flow-tracking.js';
import { project,invert3 } from '../src/tracking-math.js';
const width=320,height=240,H=[1,0,160,0,1,120,0,0,1];
function fixture(){
 const gray=new Uint8Array(width*height).fill(210),markers=new Map(),tags=[];
 let id=100;
 function draw(tagId,x,z,size=20){
  const corners=[[-size/2,size/2],[size/2,size/2],[size/2,-size/2],[-size/2,-size/2]].map(([a,b])=>({x:x+a+160,y:z+b+120}));
  tags.push({id:tagId,corners});
  for(let y=-size/2;y<size/2;y++)for(let xx=-size/2;xx<size/2;xx++){
   const border=Math.abs(xx)>=size/2-2||Math.abs(y)>=size/2-2;
   gray[(z+y+120)*width+x+xx+160]=border?10:(((Math.floor((xx+size/2)/3)*13+Math.floor((y+size/2)/3)*7+tagId)%5)<2?240:10);
  }
 }
 for(const z of [-70,0,70])for(const x of [-80,0,80]){markers.set(id,{id,center_page_mm:[x+105,148.5-z],black_square_mm:20});draw(id++,x,z);}
 draw(10,35,90);
 return {gray,markers,tags};
}
function warp(gray,matrix,occlude=false){
 const inv=invert3(matrix),output=new Uint8Array(gray.length).fill(210);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const [a,b]=project(inv,x,y),xx=Math.round(a),yy=Math.round(b);
  if(xx>=0&&yy>=0&&xx<width&&yy<height)output[y*width+x]=gray[yy*width+xx];
  if(occlude&&x<130)output[y*width+x]=130;
 }
 return output;
}
function seed(){const f=fixture(),flow=new BoardFlow(f.markers);flow.prepare(f.gray,width,height,0);flow.seed(f.tags,{h:H,count:9});flow.lastDetection=0;flow.finish();return {...f,flow};}

test('tracks board translation and rotation with multiple independent anchor points',()=>{
 const {flow,gray}=seed(),angle=.015,motion=[Math.cos(angle),-Math.sin(angle),3,Math.sin(angle),Math.cos(angle),-2,0,0,1];
 flow.prepare(warp(gray,motion),width,height,16);const result=flow.track();
 assert.ok(result);assert.ok(result.trackedPoints>=12);assert.ok(result.trackedPoints<=80);
 for(const point of [[0,0],[-70,-60],[70,60]]){
  const expected=project(motion,...project(H,...point)),actual=project(result.board.h,...point);
  assert.ok(Math.hypot(actual[0]-expected[0],actual[1]-expected[1])<1.2);
 }
 assert.ok(result.tags.some(t=>t.id===10));
});

test('survives partial occlusion but rejects full occlusion and stale anchors',()=>{
 const {flow,gray}=seed();flow.prepare(warp(gray,[1,0,2,0,1,1,0,0,1],true),width,height,16);
 const partial=flow.track();assert.ok(partial);assert.ok(partial.trackedPoints<80);flow.finish();
 flow.prepare(new Uint8Array(gray.length).fill(130),width,height,32);assert.equal(flow.track(),null);
 const fresh=seed();fresh.flow.prepare(fresh.gray,width,height,1100);assert.equal(fresh.flow.track(),null);
});

test('RANSAC ignores independently moving points and rejects anchors on a line',()=>{
 const points=Array.from({length:40},(_,i)=>{const world=[(i%8)*20-70,Math.floor(i/8)*30-60],image=project(H,...world);if(i<10){image[0]+=40;image[1]-=20;}return{id:100+i%8,world,image};});
 const result=robustBoard(points);assert.ok(result);assert.equal(result.points.length,30);
 assert.ok(Math.hypot(...project(result.h,0,0).map((v,i)=>v-[160,120][i]))<1e-5);
 assert.equal(robustBoard(points.map((p,i)=>({...p,world:[i*5,i*5]}))),null);
});

test('point selection spans the field instead of clustering around one marker',()=>{
 const points=Array.from({length:100},(_,i)=>({world:[i%10*20,Math.floor(i/10)*20],image:[0,0]}));
 const selected=spreadPoints(points,12);assert.equal(selected.length,12);
 assert.ok(selected.some(p=>p.world[0]===180&&p.world[1]===180));
 assert.ok(selected.some(p=>p.world[0]===0&&p.world[1]===180));
});

test('one visible marker remains a detection-only case rather than a fragile flow lock',()=>{
 const f=fixture(),flow=new BoardFlow(f.markers);flow.prepare(f.gray,width,height,0);flow.seed(f.tags.slice(0,1),{h:H,count:1});
 assert.equal(flow.canTrack(),false);
});

test('tracks a moved tower independently without moving the board',()=>{
 const {flow,gray}=seed(),moved=gray.slice(),cx=195,cy=210;
 for(let y=-12;y<12;y++)for(let x=-12;x<16;x++)moved[(cy+y)*width+cx+x]=210;
 for(let y=-12;y<12;y++)for(let x=-12;x<12;x++)moved[(cy+y)*width+cx+x+4]=gray[(cy+y)*width+cx+x];
 flow.prepare(moved,width,height,16);const result=flow.track();assert.ok(result);
 const center=project(result.board.h,0,0);assert.ok(Math.hypot(center[0]-160,center[1]-120)<.5);
 const tower=result.tags.find(t=>t.id===10);assert.ok(tower);
 const x=tower.corners.reduce((s,c)=>s+c.x,0)/4;assert.ok(Math.abs(x-199)<1);
});
