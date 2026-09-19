import jsfeat from 'jsfeat';
import { fitHomography, invert3, project, tagPairs } from './tracking-math.js';

export const DETECTION_INTERVAL=300;
const MAX_BOARD_POINTS=80,MAX_POINTS=120,MIN_POINTS=12;

// Select points across the plane, rather than spending the budget on one tag.
export function spreadPoints(candidates,limit){
 if(candidates.length<=limit)return candidates;
 const selected=[candidates[0]],remaining=candidates.slice(1);
 const distances=remaining.map(p=>distance(p,selected[0]));
 while(selected.length<limit&&remaining.length){
  let best=0;for(let i=1;i<distances.length;i++)if(distances[i]>distances[best])best=i;
  const point=remaining.splice(best,1)[0];distances.splice(best,1);selected.push(point);
  for(let i=0;i<remaining.length;i++)distances[i]=Math.min(distances[i],distance(remaining[i],point));
 }
 return selected;
}
function distance(a,b){return (a.world[0]-b.world[0])**2+(a.world[1]-b.world[1])**2;}
function spreadEnough(points){
 if(points.length<MIN_POINTS||new Set(points.map(p=>p.id)).size<3)return false;
 let x=0,y=0;for(const p of points){x+=p.world[0];y+=p.world[1];}x/=points.length;y/=points.length;
 let xx=0,xy=0,yy=0;for(const p of points){const a=p.world[0]-x,b=p.world[1]-y;xx+=a*a;xy+=a*b;yy+=b*b;}
 const minor=(xx+yy-Math.hypot(xx-yy,2*xy))/(2*points.length);
 return minor>100;
}

// Deterministic RANSAC rejects points on hands/occluders and repeated patterns.
export function robustBoard(points){
 if(!spreadEnough(points))return null;
 let best=[],bestError=Infinity,seed=17;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let iteration=0;iteration<64;iteration++){
  let sample=points;
  if(iteration){const indices=new Set();while(indices.size<4)indices.add(Math.floor(random()*points.length));sample=[...indices].map(i=>points[i]);}
  const h=fitHomography(sample);if(!h)continue;
  const inliers=[];let error=0;
  for(const point of points){const pixel=project(h,...point.world),e=Math.hypot(pixel[0]-point.image[0],pixel[1]-point.image[1]);if(e<1.5){inliers.push(point);error+=e;}}
  if(inliers.length>best.length||(inliers.length===best.length&&error<bestError)){best=inliers;bestError=error;}
  if(best.length===points.length)break;
 }
 if(best.length<points.length*.6||!spreadEnough(best))return null;
 const h=fitHomography(best);return h?{h,points:best,count:new Set(best.map(p=>p.id)).size}:null;
}
function pixel(image,x,y){
 const ix=Math.floor(x),iy=Math.floor(y),dx=x-ix,dy=y-iy,i=iy*image.cols+ix,d=image.data,w=image.cols;
 return d[i]*(1-dx)*(1-dy)+d[i+1]*dx*(1-dy)+d[i+w]*(1-dx)*dy+d[i+w+1]*dx*dy;
}
function patchError(a,b,previous,next){
 let error=0;
 for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++)error+=Math.abs(pixel(a,previous[0]+x,previous[1]+y)-pixel(b,next[0]+x,next[1]+y));
 return error/25;
}
function scaledH(h,sx,sy){return [h[0]*sx,h[1]*sx,h[2]*sx,h[3]*sy,h[4]*sy,h[5]*sy,h[6],h[7],h[8]];}
function signedArea(corners){return corners.reduce((s,p,i)=>{const q=corners[(i+1)%4];return s+p.x*q.y-p.y*q.x;},0)/2;}
function tagArea(corners){return Math.abs(signedArea(corners));}
function convex(corners){const cross=corners.map((p,i)=>{const q=corners[(i+1)%4],r=corners[(i+2)%4];return(q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x);});return cross.every(v=>v>0)||cross.every(v=>v<0);}

export class BoardFlow {
 constructor(markers){
  this.markers=markers;this.points=[];this.xy=new Float32Array(MAX_POINTS*2);this.next=new Float32Array(MAX_POINTS*2);this.back=new Float32Array(MAX_POINTS*2);this.status=new Uint8Array(MAX_POINTS);this.backStatus=new Uint8Array(MAX_POINTS);this.lastDetection=-Infinity;this.lastAnchor=-Infinity;this.towerAreas=new Map();
 }
 prepare(gray,width,height,timestamp){
  const scale=Math.min(1,320/Math.max(width,height)),w=Math.round(width*scale),h=Math.round(height*scale);
  if(w!==this.width||h!==this.height){
   this.width=w;this.height=h;this.points=[];this.previous=null;this.lastAnchor=-Infinity;
   this.pyramids=[new jsfeat.pyramid_t(3),new jsfeat.pyramid_t(3)];for(const p of this.pyramids)p.allocate(w,h,jsfeat.U8C1_t);
   this.corners=null;
  }
  this.current=this.previous===this.pyramids[0]?this.pyramids[1]:this.pyramids[0];
  if(!this.input||this.input.cols!==width||this.input.rows!==height)this.input=new jsfeat.matrix_t(width,height,jsfeat.U8C1_t);
  this.input.data.set(gray);
  if(w===width&&h===height)this.current.data[0].data.set(gray);
  else jsfeat.imgproc.resample(this.input,this.current.data[0],w,h);
  this.current.build(this.current.data[0]);this.frameWidth=width;this.frameHeight=height;this.timestamp=timestamp;
 }
 seed(tags,board){
  const sx=this.width/this.frameWidth,sy=this.height/this.frameHeight,h=scaledH(board.h,sx,sy),inv=invert3(h);
  const candidates=[],validMarkers=[];
  for(const tag of tags){const marker=this.markers.get(tag.id);if(!marker)continue;
   const pairs=tagPairs(tag,marker);
   if(pairs.some(p=>{const q=project(board.h,...p.world);return Math.hypot(q[0]-p.image[0],q[1]-p.image[1])>5;}))continue;
   validMarkers.push({id:tag.id,x:marker.center_page_mm[0]-105,y:148.5-marker.center_page_mm[1],half:marker.black_square_mm/2});
   for(const p of pairs)candidates.push({id:tag.id,world:p.world,image:[p.image[0]*sx,p.image[1]*sy]});
  }
  // Extra texture points are seeded only inside verified printed board tags,
  // never on arbitrary foreground objects which might move independently.
  if(candidates.length<MAX_BOARD_POINTS){
   if(!this.corners)this.corners=Array.from({length:this.width*this.height},()=>new jsfeat.keypoint_t(0,0,0,0));
  const count=jsfeat.fast_corners.detect(this.current.data[0],this.corners,6);
  for(let i=0;i<count;i++){
   const c=this.corners[i],world=project(inv,c.x,c.y),marker=validMarkers.find(m=>Math.abs(world[0]-m.x)<m.half-1&&Math.abs(world[1]-m.y)<m.half-1);
   if(marker)candidates.push({id:marker.id,world,image:[c.x,c.y]});
  }
  }
  this.points=spreadPoints(candidates,MAX_BOARD_POINTS);
  this.towerAreas.clear();
  for(const tag of tags){if(tag.id<10||tag.id>19||this.towerAreas.has(tag.id))continue;
   const corners=tag.corners.map(p=>({x:p.x*sx,y:p.y*sy}));this.towerAreas.set(tag.id,tagArea(corners));
   corners.forEach((p,corner)=>this.points.push({id:tag.id,tower:true,corner,image:[p.x,p.y]}));
  }
  this.lastAnchor=this.timestamp;this.previous=this.current;this.lastH=h;
  return this.points.filter(p=>!p.tower).length;
 }
 track(){
  if(!this.previous||!this.points.length||this.timestamp-this.lastAnchor>1000||this.timestamp-this.lastFrame>200)return null;
  const count=this.points.length;
  for(let i=0;i<count;i++){this.xy[i*2]=this.points[i].image[0];this.xy[i*2+1]=this.points[i].image[1];}
  // Larger patches retain enough structure when camera motion smears small tags.
  // Forward/backward and geometric checks remain strict.
  jsfeat.optical_flow_lk.track(this.previous,this.current,this.xy,this.next,count,11,15,this.status,.03,.001);
  jsfeat.optical_flow_lk.track(this.current,this.previous,this.next,this.back,count,11,15,this.backStatus,.03,.001);
  const good=[];
  for(let i=0;i<count;i++){
   const x=this.next[2*i],y=this.next[2*i+1];
   if(!this.status[i]||!this.backStatus[i]||x<5||y<5||x>=this.width-6||y>=this.height-6)continue;
   if(Math.hypot(this.back[2*i]-this.xy[2*i],this.back[2*i+1]-this.xy[2*i+1])>.8)continue;
   const original=this.points[i];if(patchError(this.previous.data[0],this.current.data[0],original.image,[x,y])>45)continue;
   good.push({...original,image:[x,y]});
  }
  const board=robustBoard(good.filter(p=>!p.tower));if(!board)return null;
  const oldCorners=[[-105,-148.5],[105,-148.5],[105,148.5],[-105,148.5]].map(p=>{const [x,y]=project(this.lastH,...p);return{x,y};});
  const newCorners=[[-105,-148.5],[105,-148.5],[105,148.5],[-105,148.5]].map(p=>{const [x,y]=project(board.h,...p);return{x,y};});
  const ratio=tagArea(newCorners)/tagArea(oldCorners);if(!Number.isFinite(ratio)||ratio<.5||ratio>2||!convex(newCorners)||signedArea(newCorners)*signedArea(oldCorners)<=0)return null;
  const towers=new Map();for(const p of good){if(!p.tower)continue;if(!towers.has(p.id))towers.set(p.id,[]);towers.get(p.id).push(p);}
  const tags=[],towerPoints=[],sx=this.frameWidth/this.width,sy=this.frameHeight/this.height;
  for(const [id,points] of towers){
   if(points.length!==4||this.timestamp-this.lastDetection>600)continue;
   points.sort((a,b)=>a.corner-b.corner);const corners=points.map(p=>({x:p.image[0],y:p.image[1]})),area=tagArea(corners)/this.towerAreas.get(id);
   if(area<.4||area>2.5||!convex(corners))continue;
   tags.push({id,corners:corners.map(p=>({x:p.x*sx,y:p.y*sy}))});towerPoints.push(...points);
  }
  this.points=[...board.points,...towerPoints];this.previous=this.current;this.lastH=board.h;
  return {board:{h:scaledH(board.h,sx,sy),count:board.count},tags,trackedPoints:board.points.length};
 }
 canTrack(){return spreadEnough(this.points.filter(p=>!p.tower));}
 finish(){this.lastFrame=this.timestamp;}
 clear(){this.points=[];this.previous=null;this.lastAnchor=-Infinity;}
}
