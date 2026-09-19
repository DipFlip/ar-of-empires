import AprilTagWasm from './vendor/apriltag.js';
import { BoardFlow, DETECTION_INTERVAL } from './flow-tracking.js';
import { estimateBoard } from './tracking-math.js';

let module,setBuffer,detect,setOptions,flow,ready=false;
const decoder=new TextDecoder();
function announce(){if(module&&flow&&!ready){ready=true;self.postMessage({type:'ready'});}}
AprilTagWasm({locateFile:()=>new URL('/vendor/apriltag/apriltag_wasm.wasm',self.location.origin).href}).then(m=>{
 module=m;m.cwrap('atagjs_init','number',[])();
 setOptions=m.cwrap('atagjs_set_detector_options','number',Array(7).fill('number'));
 setOptions(2,0,1,1,0,0,0);
 setBuffer=m.cwrap('atagjs_set_img_buffer','number',['number','number','number']);detect=m.cwrap('atagjs_detect','number',[]);announce();
}).catch(error=>self.postMessage({type:'error',message:String(error)}));
self.onmessage=({data})=>{
 if(data.type==='configure'){flow=new BoardFlow(new Map(data.markers.map(m=>[m.id,m])));announce();return;}
 if(!ready)return;
 const started=performance.now(),gray=new Uint8Array(data.gray);
 try{
  const timings={...data.timings,outboundMs:Math.max(0,performance.timeOrigin+started-data.postedAt),detectMs:0,bufferMs:0,decodeMs:0};
  const prepareStart=performance.now();flow.prepare(gray,data.width,data.height,data.timestamp);timings.pyramidMs=performance.now()-prepareStart;
  let result=null;const flowStart=performance.now();
  if(!data.forceDetect)result=flow.track();
  timings.flowMs=performance.now()-flowStart;
  let mode='flow',detected=false;
  if(data.forceDetect||!result||data.timestamp-flow.lastDetection>=DETECTION_INTERVAL){
   mode='detect';detected=true;
   // Acquisition uses the less aggressive setting to retain small/distant tags.
   setOptions(flow.lastAnchor===-Infinity?1.5:2,0,1,1,0,0,0);
   const copyStart=performance.now(),pointer=setBuffer(data.width,data.height,data.width);module.HEAPU8.set(gray,pointer);timings.bufferMs=performance.now()-copyStart;
   const detectStart=performance.now(),pointerResult=detect();timings.detectMs=performance.now()-detectStart;
   const decodeStart=performance.now(),length=module.getValue(pointerResult,'i32'),chars=module.getValue(pointerResult+4,'i32');
   const tags=length?JSON.parse(decoder.decode(new Uint8Array(module.HEAPU8.buffer,chars,length))):[];timings.decodeMs=performance.now()-decodeStart;
   const fitStart=performance.now(),board=estimateBoard(tags,flow.markers);timings.boardFitMs=performance.now()-fitStart;
   flow.lastDetection=data.timestamp;
   if(board){const seedStart=performance.now(),trackedPoints=flow.seed(tags,board);timings.seedMs=performance.now()-seedStart;result={board,tags,trackedPoints};}
   else {
    // No full marker decoded: never manufacture tower observations. Keep a
    // checked optical-flow board only briefly, then require tag reacquisition.
    if(!result&&data.forceDetect){const fallbackStart=performance.now();result=flow.track();timings.flowMs+=performance.now()-fallbackStart;}
    if(result){result.tags=tags;mode='flow';const seen=new Set(tags.map(t=>t.id));flow.points=flow.points.filter(p=>!p.tower||seen.has(p.id));}
    else {flow.clear();result={board:null,tags,trackedPoints:0};}
   }
  }
  flow.finish();timings.workerMs=performance.now()-started;
  self.postMessage({type:'detections',...result,mode,detected,flowReady:flow.canTrack(),lastDetection:flow.lastDetection,width:data.width,height:data.height,timestamp:data.timestamp,
   gray:data.gray,sentAt:performance.timeOrigin+performance.now(),timings},[data.gray]);
 }catch(error){flow.clear();self.postMessage({type:'error',message:String(error)});}
};
