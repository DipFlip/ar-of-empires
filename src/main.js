import './style.css';
import manifest from '../assets/apriltags/marker-manifest.json';
import { SiegeGame } from './game.js';
import { World } from './world.js';
import { Tracker } from './tracker.js';
import { PerformanceMonitor } from './performance.js';
const $=id=>document.getElementById(id);
const game=new SiegeGame();
let world;
try{world=new World($('scene'));}catch(error){$('notice').hidden=false;$('notice').textContent='This browser could not start 3D graphics. Try a current Safari or Chrome browser.';throw error;}
let cameraFailure='';
let mode='menu',stream=null,userPaused=false,lastBoard=0,visibleTags=0,lastTime=performance.now(),uiTime=0,toastTimer,selected=10,dragId=null,enterToken=0;
const seenTowers=new Map();
const tracker=new Tracker($('camera'),manifest,onTracking,error=>{
 if(mode==='ar'){cameraFailure='Tracking stopped. Return to the menu and reconnect: '+error;lastBoard=0;}
});
const performanceMonitor=new PerformanceMonitor(world.renderer,tracker,new URLSearchParams(location.search).has('stats'));
world.monitor=performanceMonitor;
let noticeMessage,noticeError;
function setNotice(message,error=false){if(message===noticeMessage&&error===noticeError)return;noticeMessage=message;noticeError=error;$('notice').hidden=!message;$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function toast(message){$('wave-toast').textContent=message;$('wave-toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('wave-toast').classList.remove('show'),2800);}
function buildSlots(){
 for(let id=10;id<20;id++){
  const button=document.createElement('button');button.className='tower-slot';button.textContent=String.fromCharCode(65+id-10);button.setAttribute('aria-label','Tower '+button.textContent);button.dataset.id=id;
  button.addEventListener('click',()=>{
   if(mode!=='demo')return;selected=id;
   if(game.towers.has(id))game.towers.delete(id);
   else {const index=id-10,angle=index/10*Math.PI*2;game.setTower(id,Math.sin(angle)*65,Math.cos(angle)*95);}
   updateUI();
  });$('tower-slots').appendChild(button);
 }
}
function preview(){game.reset();game.setTower(10,-66,35);game.setTower(11,62,-37);game.setTower(12,-30,-99);for(let i=0;i<6;i++)game.spawn();game.enemies.forEach((e,i)=>{e.x*=.8;e.z*=.8;e.moving=true;});world.ranges=false;}
function setupDemo(){game.reset();game.setTower(10,-62,45);game.setTower(11,65,-35);game.setTower(12,-35,-100);world.ranges=true;userPaused=false;world.setDemo();$('tower-hint').textContent='Tap A–J to add or remove towers. Drag a tower to reposition it. Range: 80 mm.';}
function setMode(next){mode=next;$('pause-btn').textContent='Pause';clearTimeout(toastTimer);$('wave-toast').classList.remove('show');$('wave-toast').textContent='';document.body.className=next==='menu'?'menu':`playing ${next}`;$('welcome').hidden=next!=='menu';$('hud').hidden=next==='menu';$('battle-controls').hidden=next==='menu';$('pause-btn').hidden=true;$('start-btn').hidden=false;$('range-btn').setAttribute('aria-pressed',String(world.ranges));resize();updateUI();}
function resize(){
 const viewport=$('viewport');
 if(mode==='ar'&&$('camera').videoWidth){
  const ratio=$('camera').videoWidth/$('camera').videoHeight,w=innerWidth,h=$('app').clientHeight;
  const vw=Math.min(w,h*ratio),vh=vw/ratio;Object.assign(viewport.style,{width:vw+'px',height:vh+'px',left:(w-vw)/2+'px',top:(h-vh)/2+'px'});
 }else {viewport.style.width='';viewport.style.height='';viewport.style.left='';viewport.style.top='';}
 world.resize();if(mode==='ar'&&tracker.h)world.applyBoard(tracker.h,tracker.width,tracker.height);
}
async function enterCamera(){
 cameraFailure='';const token=++enterToken;$('camera-btn').disabled=true;setNotice('Opening your camera and preparing the battlefield…');
 try{
  if(!isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('Camera play needs HTTPS (or localhost on this computer). Open the secure site on your phone. You can still try the demo.');
  // Ask for the rear camera only; no microphone or recording.
  const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:960},frameRate:{ideal:60}}});
  if(token!==enterToken){media.getTracks().forEach(t=>t.stop());return;}stream=media;
  await tracker.init();if(token!==enterToken)return;
  $('camera').srcObject=media;await $('camera').play();
  game.reset();seenTowers.clear();lastBoard=0;visibleTags=0;userPaused=false;world.ranges=true;world.setAR();setMode('ar');
  $('tower-hint').textContent='Place Tag A–J flat on the field. Each tower covers an 80 mm radius.';
  media.getVideoTracks()[0].addEventListener('ended',()=>{if(mode==='ar'){lastBoard=0;cameraFailure='The camera stopped. Return to the menu to reconnect.';}});
  tracker.start();setNotice('Point the camera at your field. Keep a few tags visible, then place your tower papers.');
 }catch(error){
  stopCamera();const messages={NotAllowedError:'Camera access was not allowed. Enable it in your browser settings, or try the demo.',NotFoundError:'No camera was found. Try this on your phone, or play the demo.',NotReadableError:'The camera is busy. Close other camera apps and try again.'};
  setNotice(messages[error.name]||error.message,true);
 }finally{$('camera-btn').disabled=false;}
}
function stopCamera(){tracker.stop();stream?.getTracks().forEach(t=>t.stop());stream=null;$('camera').srcObject=null;}
function onTracking(frame){
 if(mode!=='ar')return;
 visibleTags=frame.count;
 if(frame.h){
  lastBoard=frame.timestamp;world.applyBoard(frame.h,frame.width,frame.height);
  for(const t of frame.towers){
   game.setTower(t.id,t.x,t.z,true);seenTowers.set(t.id,performance.now());
  }
 }
}
let uiWave;
function setText(element,text){text=String(text);if(element.textContent!==text)element.textContent=text;}
function updateUI(){
 setText($('hp-value'),Math.ceil(game.hp).toLocaleString());
 const hpWidth=game.hp/10+'%';if($('hp-fill').style.width!==hpWidth)$('hp-fill').style.width=hpWidth;
 if(uiWave!==game.wave){uiWave=game.wave;$('wave-value').innerHTML=`${String(Math.max(1,game.wave)).padStart(2,'0')} <em>/ 06</em>`;}
 setText($('kills-value'),game.kills);
 const count=[...game.towers.values()].filter(t=>t.active).length;setText($('tower-count'),`${count} / 10 deployed`);
 document.querySelectorAll('.tower-slot').forEach(b=>{
  const tower=game.towers.get(Number(b.dataset.id)),active=!!tower?.active,pressed=String(active),disabled=mode==='ar';
  b.classList.toggle('active',active);if(b.getAttribute('aria-pressed')!==pressed)b.setAttribute('aria-pressed',pressed);if(b.disabled!==disabled)b.disabled=disabled;
 });
 const locked=mode==='ar'&&!cameraFailure&&performance.now()-lastBoard<650;
 $('tracking-status').classList.toggle('locked',locked||mode==='demo');
 setText($('tracking-status').querySelector('span'),mode==='menu'?'Tabletop preview':mode==='demo'?'Demo · drag your towers':locked?`Field locked · ${visibleTags} tags${tracker.metrics?.hz ? ` · ${tracker.metrics.hz.toFixed(1)} Hz` : ''}`:'Looking for the field');
 const disabled=mode==='ar'&&(!locked||count===0);if($('start-btn').disabled!==disabled)$('start-btn').disabled=disabled;
}
function showResult(){
 $('result-title').textContent=game.state==='victory'?'The keep stands.':'The keep has fallen.';
 $('result-kicker').textContent=game.state==='victory'?'SIX WAVES. ONE KINGDOM.':'THE SIEGE IS OVER';
 $('result-description').textContent=game.state==='victory'?`Your archers defeated ${game.kills} enemies. ${Math.ceil(game.hp)} castle health remains. A well-defended little kingdom.`:`You held out until wave ${game.wave} and defeated ${game.kills} enemies. Spread your towers around the keep and cover all four approaches.`;
 if(!$('result').open)$('result').showModal();
}
function animate(now){
 requestAnimationFrame(animate);const started=performance.now(),frameMs=now-lastTime,dt=Math.min(frameMs/1000,.05);lastTime=now;
 const lost=mode==='ar'&&(now-lastBoard>650||!!cameraFailure);
 if(mode==='ar'){
  for(const [id,t] of game.towers)t.active=now-(seenTowers.get(id)||0)<1400;
  world.root.visible=!lost;
  if(cameraFailure)setNotice(cameraFailure,true);
  else if(lost)setNotice('Field out of view — battle paused. Point back at the printed grid.');
  else setNotice(userPaused?'Battle paused. Reposition your towers, then resume.':'');
 }
 const paused=userPaused||lost||$('help').open||document.hidden;
 const gameStart=performance.now();
 if(mode!=='menu'&&!paused){game.step(dt);for(const event of game.events){if(event.type==='wave')toast(`Wave ${event.wave} · Hold the line`);else if(event.type==='victory'||event.type==='defeat')showResult();}game.events=[];}
 if(mode==='menu')game.time+=dt;
 const gameMs=performance.now()-gameStart;
 world.update(game,dt,now/1000);
 const uiStart=performance.now();
 if(now-uiTime>120){updateUI();uiTime=now;}
 performanceMonitor.record(now,frameMs,{gameMs,...world.metrics,uiMs:performance.now()-uiStart,frameCallbackMs:performance.now()-started});
}
buildSlots();preview();setMode('menu');requestAnimationFrame(animate);
$('camera-btn').addEventListener('click',enterCamera);
$('demo-btn').addEventListener('click',()=>{enterToken++;stopCamera();setNotice('');setupDemo();setMode('demo');});
$('start-btn').addEventListener('click',()=>{if($('start-btn').disabled)return;game.start();$('start-btn').hidden=true;$('pause-btn').hidden=false;});
$('pause-btn').addEventListener('click',()=>{userPaused=!userPaused;$('pause-btn').textContent=userPaused?'Resume':'Pause';setNotice(userPaused?'Battle paused. Reposition your towers, then resume.':'');});
$('range-btn').addEventListener('click',()=>{$('range-btn').setAttribute('aria-pressed',String(world.toggleRanges()));});
$('exit-btn').addEventListener('click',()=>{enterToken++;stopCamera();setNotice('');world.setDemo();preview();setMode('menu');userPaused=false;});
$('help-btn').addEventListener('click',()=>$('help').showModal());$('help-close').addEventListener('click',()=>$('help').close());
$('restart-btn').addEventListener('click',()=>{
 $('result').close();if(mode==='demo')setupDemo();else{game.reset();seenTowers.clear();}userPaused=false;$('pause-btn').textContent='Pause';$('pause-btn').hidden=true;$('start-btn').hidden=false;setNotice('');updateUI();
});
$('result').addEventListener('cancel',event=>event.preventDefault());
const canvas=world.renderer.domElement;
canvas.addEventListener('pointerdown',event=>{
 if(mode!=='demo')return;const point=world.pickGround(event);if(!point)return;
 const nearest=[...game.towers.values()].sort((a,b)=>Math.hypot(a.x-point.x,a.z-point.z)-Math.hypot(b.x-point.x,b.z-point.z))[0];
 if(nearest&&Math.hypot(nearest.x-point.x,nearest.z-point.z)<30){dragId=nearest.id;canvas.setPointerCapture(event.pointerId);}
});
canvas.addEventListener('pointermove',event=>{if(dragId===null)return;const p=world.pickGround(event);if(p)game.setTower(dragId,Math.max(-99,Math.min(99,p.x)),Math.max(-142,Math.min(142,p.z)));});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{dragId=null;});
window.addEventListener('resize',resize);$('camera').addEventListener('resize',resize);window.addEventListener('pagehide',()=>{enterToken++;stopCamera();});
if(import.meta.env.DEV)window.__paperkeep={game,world,tracker,performance:performanceMonitor,get mode(){return mode;},get lastBoard(){return lastBoard;},onTracking};
