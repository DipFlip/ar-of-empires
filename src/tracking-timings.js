// Aggregate outside the scan loop so instrumentation does not sort every frame.
export function summarizeTracking(samples,split=true){
 const fields=['pyramidMs','flowMs','seedMs','boardFitMs','resizeMs','drawMs','readbackMs','grayMs','prepMs','outboundMs','bufferMs','detectMs','decodeMs','workerMs','returnMs','fitMs','applyMs','cycleMs','idleMs','intervalMs','renderWaitMs','captureToRenderMs'];
 const result={samples:samples.length};
 for(const field of fields){
  const values=samples.map(s=>s[field]).filter(Number.isFinite).sort((a,b)=>a-b);
  if(values.length)result[field]={p50:values[Math.ceil(values.length*.5)-1],p95:values[Math.ceil(values.length*.95)-1]};
 }
 const cycles=samples.map(s=>s.cycleMs).filter(Number.isFinite);
 result.overBudgetPercent=cycles.length?cycles.filter(ms=>ms>1000/60).length/cycles.length*100:0;
 if(split&&samples.some(s=>typeof s.detected==='boolean')){
  result.flow=summarizeTracking(samples.filter(s=>!s.detected),false);
  result.detection=summarizeTracking(samples.filter(s=>s.detected),false);
  const span=samples.at(-1).sampleTime-samples[0].sampleTime;
  result.detectionHz=span>0?result.detection.samples*1000/span:0;
 }
 return result;
}
