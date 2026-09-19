// GPU queries are asynchronous and opt-in: never stall the GPU to measure it.
export class PerformanceMonitor {
 constructor(renderer,tracker,show=false){
  this.renderer=renderer;this.tracker=tracker;this.snapshot={fps:0};this.start=0;this.frames=0;this.sums={};this.worst=0;this.queries=[];
  if(show){
   this.gl=renderer.getContext();this.ext=this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
   this.panel=document.createElement('pre');this.panel.className='performance-stats';this.panel.setAttribute('aria-label','Performance diagnostics');document.body.appendChild(this.panel);
  }
 }
 beginRender(){
  if(!this.ext||this.queries.length>=8)return;
  this.query=this.gl.createQuery();this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT,this.query);
 }
 endRender(){
  if(!this.ext)return;
  if(this.query){this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);this.queries.push(this.query);this.query=null;}
  const gl=this.gl,disjoint=gl.getParameter(this.ext.GPU_DISJOINT_EXT);
  while(this.queries.length&&gl.getQueryParameter(this.queries[0],gl.QUERY_RESULT_AVAILABLE)){
   const query=this.queries.shift();if(!disjoint)this.gpuMs=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;gl.deleteQuery(query);
  }
  if(disjoint){this.gpuMs=undefined;for(const query of this.queries)gl.deleteQuery(query);this.queries=[];}
 }
 record(now,frameMs,phases){
  if(!this.start){this.start=now;return;}
  // A background tab or resumed window is not a meaningful frame-rate sample.
  if(frameMs>1000){this.start=now;this.frames=0;this.sums={};this.worst=0;return;}
  this.frames++;this.worst=Math.max(this.worst,frameMs);
  for(const [key,value] of Object.entries(phases))this.sums[key]=(this.sums[key]||0)+value;
  if(now-this.start<500)return;
  this.snapshot={fps:this.frames*1000/(now-this.start),worstFrameMs:this.worst,gpuMs:this.gpuMs,
   ...Object.fromEntries(Object.entries(this.sums).map(([key,value])=>[key,value/this.frames])),
   drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,
   geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures};
  this.start=now;this.frames=0;this.sums={};this.worst=0;
  if(this.panel){
   const s=this.snapshot,t=this.tracker.metrics||{},ms=value=>Number.isFinite(value)?value.toFixed(1):'—';
   this.panel.textContent=`Render ${ms(s.fps)} fps · tracking ${ms(t.hz)} Hz\nAnimation ${ms(s.frameCallbackMs)} ms · worst frame ${ms(s.worstFrameMs)} ms\nGame ${ms(s.gameMs)} · scene ${ms(s.sceneMs)} · UI ${ms(s.uiMs)} ms\nRender CPU ${ms(s.renderCpuMs)} · GPU ${ms(s.gpuMs)} ms\nDraw calls ${s.drawCalls} · triangles ${s.triangles}\nCapture ${ms(t.prepMs)} · detect ${ms(t.detectMs)} · fit ${ms(t.fitMs)} ms\nTracking latency ${ms(t.latencyMs)} ms · ${t.width||0}×${t.height||0}\nGeometries ${s.geometries} · textures ${s.textures}`;
  }
 }
}
