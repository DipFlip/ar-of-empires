// Playwright CLI eval function. Exercises the real worker/WASM with a moving
// synthetic camera, partial/full occlusion, tower discovery and tower movement.
async () => {
 const {Tracker}=await import('/src/tracker.js');const {project,invert3}=await import('/src/tracking-math.js');
 const manifest=await(await fetch('/assets/apriltags/marker-manifest.json')).json();
 const image=new Image();image.src='/tests/fixtures/board-with-towers.png';await image.decode();
 const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');
 const stream=canvas.captureStream(60),video=document.createElement('video');video.muted=true;video.playsInline=true;video.srcObject=stream;
 ctx.drawImage(image,0,0);await video.play();let start,animation,stage='static',transform={x:0,y:0,angle:0},baseH,baseWidth,baseHeight,towerRect,expected;
 const samples=[];let failure;
 const stages=[['static',700],['moving',1300],['partial',900],['blank',400],['recover',500],['hideTower',650],['newTower',650],['moveTower',800]];
 const total=stages.reduce((s,p)=>s+p[1],0);
 function paint(now){
  if(start===undefined)start=now;const elapsed=now-start;let t=elapsed;
  for(const [name,duration] of stages){stage=name;if(t<duration)break;t-=duration;}
  transform=stage==='moving'||stage==='partial'?{x:Math.sin(elapsed/600)*25,y:Math.cos(elapsed/800)*15,angle:Math.sin(elapsed/1000)*.035}:{x:0,y:0,angle:0};
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#999';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.translate(canvas.width/2+transform.x,canvas.height/2+transform.y);ctx.rotate(transform.angle);ctx.translate(-canvas.width/2,-canvas.height/2);
  ctx.drawImage(image,0,0);
  if(towerRect&&(stage==='hideTower'||stage==='moveTower')){
   const r=towerRect;ctx.fillStyle='#999';ctx.fillRect(r.x-2,r.y-2,r.w+4,r.h+4);
   if(stage==='moveTower')ctx.drawImage(image,r.x,r.y,r.w,r.h,r.x+35,r.y,r.w,r.h);
  }
  ctx.setTransform(1,0,0,1,0,0);
  if(stage==='partial'){ctx.fillStyle='#999';ctx.fillRect(0,0,canvas.width*.42,canvas.height);}
  if(stage==='blank'){ctx.fillStyle='#999';ctx.fillRect(0,0,canvas.width,canvas.height);}
  animation=requestAnimationFrame(paint);
 }
 animation=requestAnimationFrame(paint);
 const tracker=new Tracker(video,manifest,frame=>{
  if(!expected)return;
  if(!baseH&&frame.h){baseH=frame.h;baseWidth=frame.width;baseHeight=frame.height;}
  if(!towerRect){const tag=frame.tags.find(t=>t.id===10);if(tag){const xs=tag.corners.map(p=>p.x/frame.width*canvas.width),ys=tag.corners.map(p=>p.y/frame.height*canvas.height);towerRect={x:Math.floor(Math.min(...xs)-5),y:Math.floor(Math.min(...ys)-5),w:Math.ceil(Math.max(...xs)-Math.min(...xs)+10),h:Math.ceil(Math.max(...ys)-Math.min(...ys)+10)};}}
  let error=null;
  if(frame.h&&baseH){const errors=[[-80,-100],[0,0],[80,100]].map(p=>{
   const original=project(baseH,...p),x=original[0]/baseWidth*canvas.width-canvas.width/2,y=original[1]/baseHeight*canvas.height-canvas.height/2,m=expected.transform;
   const target=[Math.cos(m.angle)*x-Math.sin(m.angle)*y+canvas.width/2+m.x,Math.sin(m.angle)*x+Math.cos(m.angle)*y+canvas.height/2+m.y];
   const actual=project(frame.h,...p);return Math.hypot(actual[0]/frame.width*canvas.width-target[0],actual[1]/frame.height*canvas.height-target[1]);
  });error=Math.max(...errors);}
  samples.push({stage:expected.stage,t:expected.t,locked:!!frame.h,error,towers:frame.towers.map(t=>({id:t.id,x:t.x,z:t.z})),mode:frame.mode,points:frame.trackedPoints,latency:performance.now()-frame.timestamp});
 },error=>{failure=String(error);});
 const scan=tracker.scan;tracker.scan=function(...args){expected={stage,transform:{...transform},t:performance.now()-start};return scan.apply(this,args);};
 try{
  await tracker.init();start=undefined;tracker.start();await new Promise(r=>setTimeout(r,total+100));
  const summary=stages.map(([name])=>{const rows=samples.filter(s=>s.stage===name),errors=rows.map(s=>s.error).filter(Number.isFinite).sort((a,b)=>a-b);return {stage:name,frames:rows.length,locked:rows.filter(s=>s.locked).length,flowFrames:rows.filter(s=>s.mode==='flow').length,p95ErrorPixels:errors[Math.floor(errors.length*.95)],lastTowerIds:rows.at(-1)?.towers.map(t=>t.id)};});
  const blank=samples.filter(s=>s.stage==='blank'),recover=samples.filter(s=>s.stage==='recover'),newTower=samples.filter(s=>s.stage==='newTower');
  if(failure)throw new Error(failure);
  if(summary.some(s=>!s.frames))throw new Error('A motion-test stage did not run');
  if(blank.slice(2).some(s=>s.locked))throw new Error('False board lock during full occlusion');
  if(!recover.slice(0,5).some(s=>s.locked))throw new Error('Board did not reacquire promptly');
  if(!newTower.some(s=>s.towers.some(t=>t.id===10)))throw new Error('Uncovered tower was not discovered');
  for(const s of summary.filter(s=>['moving','partial'].includes(s.stage)))if(s.p95ErrorPixels>5||s.locked<s.frames*.9)throw new Error('Motion/occlusion quality failed: '+JSON.stringify(s));
  const originalTower=samples.filter(s=>s.stage==='static').at(-1).towers.find(t=>t.id===10),movedTower=samples.filter(s=>s.stage==='moveTower').at(-1).towers.find(t=>t.id===10);
  if(!originalTower||!movedTower)throw new Error('Tower movement was not observed');
  const originalPixel=project(baseH,originalTower.x,originalTower.z),expectedTower=project(invert3(baseH),originalPixel[0]+35*baseWidth/canvas.width,originalPixel[1]);
  if(Math.hypot(movedTower.x-expectedTower[0],movedTower.z-expectedTower[1])>1)throw new Error('Moved tower location is incorrect');
  return {summary,samples};
 }finally{tracker.stop();cancelAnimationFrame(animation);stream.getTracks().forEach(t=>t.stop());}
}
