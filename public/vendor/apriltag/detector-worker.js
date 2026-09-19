/* Small local adapter for the BSD-licensed ARENA AprilTag WASM C API. */
importScripts('./apriltag_wasm.js');
let module, setBuffer, detect;
const decoder = new TextDecoder();
AprilTagWasm({ locateFile: name => new URL(name, self.location.href).href }).then(m => {
  module = m;
  m.cwrap('atagjs_init', 'number', [])();
  m.cwrap('atagjs_set_detector_options', 'number', Array(7).fill('number'))(1.5, 0, 1, 1, 0, 0, 0);
  setBuffer = m.cwrap('atagjs_set_img_buffer', 'number', ['number', 'number', 'number']);
  detect = m.cwrap('atagjs_detect', 'number', []);
  self.postMessage({ type: 'ready' });
}).catch(error => self.postMessage({ type: 'error', message: String(error) }));
self.onmessage = ({ data }) => {
  if (!module) return;
  try {
    const started = performance.now();
    const outboundMs = Number.isFinite(data.postedAt) ? Math.max(0, performance.timeOrigin + started - data.postedAt) : undefined;
    const pointer = setBuffer(data.width, data.height, data.width);
    module.HEAPU8.set(new Uint8Array(data.gray), pointer);
    const detectStart = performance.now();
    const result = detect();
    const detectMs = performance.now() - detectStart;
    const decodeStart = performance.now();
    const length = module.getValue(result, 'i32');
    const chars = module.getValue(result + 4, 'i32');
    const tags = length ? JSON.parse(decoder.decode(new Uint8Array(module.HEAPU8.buffer, chars, length))) : [];
    const decoded = performance.now();
    self.postMessage({ type: 'detections', tags, width: data.width, height: data.height, timestamp: data.timestamp, sentAt: performance.timeOrigin + performance.now(),
      timings: { ...data.timings, prepMs: data.prepMs, outboundMs, bufferMs: detectStart - started, detectMs, decodeMs: decoded - decodeStart, workerMs: decoded - started } });
  } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
};
