import { estimateBoard, invert3, project, fitHomography } from './tracking-math.js';
export class Tracker {
 constructor(video,manifest,onFrame,onError){
  this.video=video;this.onFrame=onFrame;this.onError=onError;this.markers=new Map(manifest.markers.filter(m=>m.page===1).map(m=>[m.id,m]));
  this.canvas=document.createElement('canvas');this.ctx=this.canvas.getContext('2d',{willReadFrequently:true});this.busy=false;this.running=false;this.h=null;
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
    else if(data.type==='detections'){this.busy=false;this.receive(data);}
   };
  });
 }
 receive(data){
  const board=estimateBoard(data.tags,this.markers);
  if(board){
   const target=board.h;
   // Smooth the screen positions of board corners, not unrelated pose components.
   const corners=[[-105,-148.5],[105,-148.5],[105,148.5],[-105,148.5]];
   if(this.h&&this.width===data.width&&this.height===data.height&&data.timestamp-this.lastSeen<400){
    const pairs=corners.map(world=>{const prev=project(this.h,...world),next=project(target,...world);const jump=Math.hypot(prev[0]-next[0],prev[1]-next[1]);const alpha=jump>35?1:.72;return {world,image:prev.map((v,i)=>v+(next[i]-v)*alpha)};});
    this.h=fitHomography(pairs)||target;
   }else this.h=target;
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
 }
 scan(source=this.video){
  if(!this.ready||this.busy)return;
  const w=source.videoWidth||source.naturalWidth||source.width,h=source.videoHeight||source.naturalHeight||source.height;if(!w||!h)return;
  const scale=Math.min(1,1000/Math.max(w,h));this.canvas.width=Math.round(w*scale);this.canvas.height=Math.round(h*scale);
  this.ctx.drawImage(source,0,0,this.canvas.width,this.canvas.height);
  const rgba=this.ctx.getImageData(0,0,this.canvas.width,this.canvas.height).data;
  const gray=new Uint8Array(this.canvas.width*this.canvas.height);
  for(let i=0,j=0;i<rgba.length;i+=4,j++)gray[j]=(rgba[i]*77+rgba[i+1]*150+rgba[i+2]*29)>>8;
  this.busy=true;this.worker.postMessage({gray:gray.buffer,width:this.canvas.width,height:this.canvas.height,timestamp:performance.now()},[gray.buffer]);
 }
 start(){this.running=true;this.h=null;this.lastSeen=0;this.timer=setInterval(()=>{if(this.running&&this.video.readyState>=2)this.scan();},90);}
 stop(){this.running=false;clearInterval(this.timer);this.h=null;this.busy=false;this.worker?.terminate();this.worker=null;this.ready=false;}
}
