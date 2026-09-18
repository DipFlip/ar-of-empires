/* Small local adapter for the BSD-licensed ARENA AprilTag WASM C API. */
importScripts('./apriltag_wasm.js');
let module, setBuffer, detect;
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
    const pointer = setBuffer(data.width, data.height, data.width);
    module.HEAPU8.set(new Uint8Array(data.gray), pointer);
    const result = detect();
    const length = module.getValue(result, 'i32');
    const chars = module.getValue(result + 4, 'i32');
    const tags = length ? JSON.parse(new TextDecoder().decode(new Uint8Array(module.HEAPU8.buffer, chars, length))) : [];
    self.postMessage({ type: 'detections', tags, width: data.width, height: data.height, timestamp: data.timestamp });
  } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
};
