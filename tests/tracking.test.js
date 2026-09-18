import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {project,invert3,fitHomography,estimateBoard,planePose} from '../src/tracking-math.js';
const manifest=JSON.parse(fs.readFileSync(new URL('../assets/apriltags/marker-manifest.json',import.meta.url)));
const markers=new Map(manifest.markers.filter(t=>t.page===1).map(t=>[t.id,t]));
const H=[2.1,.3,480,-.2,1.8,320,.001,.0004,1];
function detection(m){const x=m.center_page_mm[0]-105,z=148.5-m.center_page_mm[1],s=m.black_square_mm/2;return {id:m.id,corners:[[x-s,z+s],[x+s,z+s],[x+s,z-s],[x-s,z-s]].map(p=>{const [x,y]=project(H,...p);return{x,y};})};}
test('recovers field mapping from an occluded board and rejects a wrong tag',()=>{
 const tags=[...markers.values()].filter((_,i)=>i%6===0).map(detection);
 const bad=detection(markers.get(101));bad.corners=bad.corners.map(p=>({x:p.x+90,y:p.y-80}));tags.push(bad);
 const result=estimateBoard(tags,markers);assert.equal(result.count,tags.length-1);
 for(const p of [[0,0],[-105,148.5],[105,-148.5]])assert.ok(Math.hypot(...project(result.h,...p).map((v,i)=>v-project(H,...p)[i]))<1e-5);
});
test('one unobstructed marker suffices; inverse places tower in board coordinates',()=>{
 const result=estimateBoard([detection(markers.get(113))],markers);assert.equal(result.count,1);
 const point=[63,-72],pixel=project(H,...point),back=project(invert3(result.h),...pixel);assert.ok(Math.hypot(back[0]-63,back[1]+72)<1e-4);
 assert.equal(estimateBoard([],markers),null);
});
test('3D plane matrix projects ground points exactly onto homography',()=>{
 const {matrix:m,f}=planePose(H,960,640);
 for(const [x,z] of [[0,0],[100,140],[-90,-120]]){
  const a=m[0]*x+m[2]*z+m[3],b=m[4]*x+m[6]*z+m[7],c=m[8]*x+m[10]*z+m[11];
  const pixel=[f*a/-c+480,320-f*b/-c],expected=project(H,x,z);assert.ok(Math.hypot(pixel[0]-expected[0],pixel[1]-expected[1])<1e-5);
 }
});
test('singular data is rejected',()=>{assert.equal(fitHomography(Array(4).fill({world:[0,0],image:[1,1]})),null);});
