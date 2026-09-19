import { summarizeTracking } from './tracking-timings.js';
import { estimateBoard, invert3, project } from './tracking-math.js';
export class Tracker {
 constructor(video,manifest,onFrame,onError){
  this.video=video;this.onFrame=onFrame;this.onError=onError;this.markers=new Map(manifest.markers.filter(m=>m.page===1).map(m=>[m.id,m]));
  this.canvas=document.createElement('canvas');this.ctx=this.canvas.getContext('2d',{willReadFrequently:true});this.busy=false;this.running=false;this.h=null;this.scanTimes=[];this.misses=0;this.metrics=null;this.frameCallback=null;this.runId=0;this.timingSamples=[];
 }
 async init(){
  if(this.ready)return;
  this.worker=new Worker('/vendor/apriltag/detector-worker.js');
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('The tag detector took too long to load. Reload and try again.')),20000);
   this.worker.onerror=e=>{clearTimeout(timer);reject(new Error(e.message||'Could not load the tag detector.'));this.busy=false;this.onError(e.message);};
   this.worker.onmessage=({data})=>{
    if(data.type==='ready'){clearTimeout(timer);this.ready=true;resolve();}
    else if(data.type==='error'){clearTimeout(timer);this.busy=false;reject(new Error(data.message));this.onError(data.message);}
    else if(data.type==='detections')this.complete(data);
   };
  });
 }
 receive(data){
  const received=performance.now(),fitStart=received;
  const board=estimateBoard(data.tags,this.markers);
  this.misses=board?0:this.misses+1;
  this.scanTimes.push(received);if(this.scanTimes.length>20)this.scanTimes.shift();
  this.metrics={...data.timings,returnMs:Number.isFinite(data.sentAt)?Math.max(0,performance.timeOrigin+received-data.sentAt):undefined,fitMs:performance.now()-fitStart,latencyMs:received-data.timestamp,
   hz:this.scanTimes.length>1?(this.scanTimes.length-1)*1000/(received-this.scanTimes[0]):0,
   width:data.width,height:data.height};
  data.metrics=this.metrics;
  const applyStarted=performance.now();
  if(board){
   const target=board.h;
   // Use the current multi-tag fit directly: temporal smoothing trails camera motion.
   this.h=target;
   this.width=data.width;this.height=data.height;this.lastSeen=data.timestamp;
   const inv=invert3(target),towers=[];
   for(const tag of data.tags){if(tag.id<10||tag.id>19||!inv)continue;
    const center=tag.center||{x:tag.corners.reduce((s,c)=>s+c.x,0)/4,y:tag.corners.reduce((s,c)=>s+c.y,0)/4};
    const [x,z]=project(inv,center.x,center.y);
    // Markers can sit just outside the sheet, but must share its physical plane.
    if(Number.isFinite(x)&&Number.isFinite(z)&&Math.abs(x)<180&&Math.abs(z)<225)towers.push({id:tag.id,x,z});
   }
   this.onFrame({...data,h:this.h,count:board.count,towers});
  }else this.onFrame({...data,h:null,count:0,towers:[]});
  const applied=performance.now();
  this.metrics.applyMs=applied-applyStarted;this.metrics.cycleMs=applied-data.timestamp;
  this.timingSamples.push(this.metrics);if(this.timingSamples.length>120)this.timingSamples.shift();
  if(board)this.pendingPresentation={timestamp:data.timestamp,applied,metrics:this.metrics};
 }
 markRendered(now){
  if(!this.pendingPresentation)return;
  const {timestamp,applied,metrics}=this.pendingPresentation;
  metrics.renderWaitMs=now-applied;metrics.captureToRenderMs=now-timestamp;this.pendingPresentation=null;
 }
 getTimingSummary(){return summarizeTracking(this.timingSamples);}
 scan(source=this.video){
  if(!this.ready||this.busy)return;
  const w=source.videoWidth||source.naturalWidth||source.width,h=source.videoHeight||source.naturalHeight||source.height;if(!w||!h)return;
  const timestamp=performance.now();
  // Occasionally retry at full resolution when small tags cannot be acquired.
  const longEdge=this.misses>=3&&this.misses%4===3?1000:640;
  const scale=Math.min(1,longEdge/Math.max(w,h)),width=Math.round(w*scale),height=Math.round(h*scale);
  if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
  const resized=performance.now();
  this.ctx.drawImage(source,0,0,this.canvas.width,this.canvas.height);
  const drawn=performance.now();
  const rgba=this.ctx.getImageData(0,0,this.canvas.width,this.canvas.height).data;
  const read=performance.now();
  const gray=new Uint8Array(this.canvas.width*this.canvas.height);
  for(let i=0,j=0;i<rgba.length;i+=4,j++)gray[j]=(rgba[i]*77+rgba[i+1]*150+rgba[i+2]*29)>>8;
  const prepared=performance.now(),prepMs=prepared-timestamp;
  const timings={resizeMs:resized-timestamp,drawMs:drawn-resized,readbackMs:read-drawn,grayMs:prepared-read,prepMs,
   idleMs:this.lastCompletedAt===undefined?undefined:timestamp-this.lastCompletedAt,
   intervalMs:this.lastScanAt===undefined?undefined:timestamp-this.lastScanAt};
  this.lastScanAt=timestamp;
  this.busy=true;this.worker.postMessage({gray:gray.buffer,width:this.canvas.width,height:this.canvas.height,timestamp,prepMs,timings,postedAt:performance.timeOrigin+performance.now()},[gray.buffer]);
 }
 complete(data){
  this.busy=false;
  try{this.receive(data);}finally{this.lastCompletedAt=performance.now();this.schedule();}
 }
 schedule(){
  if(!this.running||!this.ready||this.busy||this.frameCallback!==null)return;
  const runId=this.runId;
  this.frameCallback=requestAnimationFrame(()=>{
   if(!this.running||runId!==this.runId)return;
   this.frameCallback=null;
   // Capture the latest image only after the previous detection has completed.
   // Do not depend on video-frame callbacks or mediaTime advancing: some live
   // camera/browser combinations expose these APIs without reliable updates.
   if(this.video.readyState>=2)this.scan();
   if(!this.busy)this.schedule();
  });
 }
 cancelFrame(){
  if(this.frameCallback===null)return;
  cancelAnimationFrame(this.frameCallback);this.frameCallback=null;
 }
 start(){this.cancelFrame();this.runId++;this.running=true;this.h=null;this.lastSeen=0;this.scanTimes=[];this.misses=0;this.metrics=null;this.timingSamples=[];this.lastScanAt=undefined;this.lastCompletedAt=undefined;this.pendingPresentation=null;this.schedule();}
 stop(){this.pendingPresentation=null;this.running=false;this.runId++;this.cancelFrame();this.h=null;this.busy=false;this.worker?.terminate();this.worker=null;this.ready=false;}
}
