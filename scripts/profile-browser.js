// Evaluate this function on a running dev page with Playwright CLI eval.
// It samples the active scene for five seconds without changing game state.
async () => {
 const {game,world,tracker}=window.__paperkeep,renderer=world.renderer,gl=renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
 const saved={update:world.update,render:renderer.render,step:game.step,receive:tracker.receive,autoReset:renderer.info.autoReset,monitorExt:world.monitor?.ext};
 if(world.monitor)world.monitor.ext=null;
 const initialCastle=world.castle,initialTowers=new Map(world.towers),initialEnemies=new Map(world.enemies);
 const initialGeometryCount=renderer.info.memory.geometries;
 const frames=[],tracks=[],steps=[],queries=[];let last=0,lastRender={},mutations=0,longTasks=[];
 const observer=new MutationObserver(list=>mutations+=list.length);observer.observe(document.body,{attributes:true,childList:true,subtree:true,characterData:true});
 const po=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration)));po.observe({type:'longtask'});
 renderer.info.autoReset=false;
 renderer.render=function(...args){this.info.reset();const start=performance.now();const q=ext?gl.createQuery():null;if(q)gl.beginQuery(ext.TIME_ELAPSED_EXT,q);saved.render.apply(this,args);if(q){gl.endQuery(ext.TIME_ELAPSED_EXT);queries.push(q);}let gpu;while(queries.length&&gl.getQueryParameter(queries[0],gl.QUERY_RESULT_AVAILABLE)){const q=queries.shift();if(!gl.getParameter(ext.GPU_DISJOINT_EXT))gpu=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;gl.deleteQuery(q);}lastRender={cpu:performance.now()-start,gpu,calls:this.info.render.calls,triangles:this.info.render.triangles};};
 world.update=function(...args){const start=performance.now();saved.update.apply(this,args);frames.push({interval:last?start-last:0,scene:performance.now()-start,...lastRender});last=start;};
 game.step=function(...args){const start=performance.now();saved.step.apply(this,args);steps.push(performance.now()-start);};
 tracker.receive=function(data){saved.receive.call(this,data);tracks.push({...this.metrics,count:data.tags.length});};
 const q=(a,p=.5)=>{a=a.filter(Number.isFinite).sort((a,b)=>a-b);return a[Math.floor((a.length-1)*p)];};
 try{await new Promise(r=>setTimeout(r,5000));return {mode:window.__paperkeep.mode,frameCount:frames.length,fps:1000/q(frames.slice(1).map(f=>f.interval)),frameP95:q(frames.slice(1).map(f=>f.interval),.95),sceneMs:q(frames.map(f=>f.scene)),renderCpuMs:q(frames.map(f=>f.cpu)),gpuMs:q(frames.map(f=>f.gpu)),calls:q(frames.map(f=>f.calls)),triangles:q(frames.map(f=>f.triangles)),gameMs:q(steps),trackingBreakdown:tracker.getTimingSummary(),tracking:{hz:q(tracks.map(f=>f.hz)),prep:q(tracks.map(f=>f.prepMs)),detect:q(tracks.map(f=>f.detectMs)),fit:q(tracks.map(f=>f.fitMs)),latency:q(tracks.map(f=>f.latencyMs))},mutations,longTasks,initialGeometryCount,survivingAssetsReused:world.castle===initialCastle&&[...initialTowers].every(([id,m])=>!world.towers.has(id)||world.towers.get(id)===m)&&[...initialEnemies].every(([id,m])=>!world.enemies.has(id)||world.enemies.get(id)===m),geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};}
 finally{world.update=saved.update;renderer.render=saved.render;game.step=saved.step;tracker.receive=saved.receive;renderer.info.autoReset=saved.autoReset;if(world.monitor)world.monitor.ext=saved.monitorExt;observer.disconnect();po.disconnect();queries.forEach(q=>gl.deleteQuery(q));}
}
