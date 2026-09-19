# Paperkeep

A browser-based AR tower-defence prototype for the AprilTag print kit in this repository. All camera frames and detection stay on the device. No backend, account, analytics, or third-party runtime requests are required.

## Run

Use Node.js 22 (the version pinned for Vercel). With nvm, run `nvm use` first.

```sh
npm install
npm run dev
```

Open http://localhost:5173 on this computer. **Try the demo** works without a camera: tap a tower letter to add/remove it and drag towers to reposition them. Press **Begin the siege** to start.

For a phone on the same Wi-Fi:

```sh
npm run dev:https -- --port 5174
```

Open the HTTPS network address printed by Vite. This generates a self-signed development certificate; your browser/device must trust it for camera access. For frictionless phone use, serve the built `dist/` folder from a host with a trusted HTTPS certificate. Plain HTTP over a LAN address cannot access the camera. Do not use `localhost` on the phone to refer to this computer.

```sh
npm run build
npm run preview
npm test
```

`dist/` is self-contained, including the detector's WASM binary, models (procedural), and printable PDF. Deploy its entire contents at the root of an HTTPS site. This prototype does not require WebXR; it uses getUserMedia and image-based tracking, including on iOS browsers that support these APIs.

## Deploy on Vercel

Import **DipFlip/ar-of-empires** into Vercel and deploy its `main` branch. Use the repository root as the Root Directory. The checked-in `vercel.json` configures the Vite framework, `npm ci` installation, `npm run build`, and the `dist` output directory. `package.json` pins Node.js 22.

No environment variables, server functions, database, or separate camera service are required. The AprilTag worker, WASM binary, and print kit are all served from the same deployment. Open the resulting HTTPS URL directly in your phone browser, allow camera access, and choose **Play on my table**. Vercel's HTTPS deployment avoids the self-signed certificate setup needed for local phone testing.

The app currently has one root URL, so no catch-all SPA rewrite is needed; missing worker or WASM assets should remain real 404 errors rather than returning HTML. Subsequent pushes to `main` redeploy automatically once the repository is connected to the Vercel project.

See [Vercel's Vite guide](https://vercel.com/docs/frameworks/frontend/vite) for the repository import flow.

## Physical setup

1. Print `output/pdf/ar-tracker-print-kit.pdf` single-sided at **100% / Actual size**. Do not fit to page.
2. Put page 1 flat on a table. The generated board has **5 columns × 7 rows**, IDs 100–134, 30 mm black squares, and 40 mm centre spacing. This follows the actual printed kit (the game request called it 4 × 7).
3. Cut out the ten standalone tags from page 2. Tag A–J map to IDs 10–19, with 24 mm black squares. These control the archer towers. The cube IDs 20–25 are reserved and ignored by this game.
4. Choose **Play on my table**, allow the rear camera, and point at the sheet. Place tower tags on the same plane. Keep a few field tags in view and avoid glare.
5. Begin the siege. The castle is centred on the sheet. Soldiers attack in melee and archers fire from a distance. Waves enter from all four sides. Towers aim and fire automatically within **80 mm**, equal to two field tag spacings. Survive six waves.

The camera image is contain-fitted (letterboxed when needed), with exactly the same rectangle used by the 3D renderer. Don't bend the field, raise tower tags, or use a different marker layout without updating the manifest.

## Tracking behaviour

- The tracker alternates full AprilTag detection (normally every 300 ms) with pyramidal Lucas–Kanade optical flow. Camera input requests 60 fps when supported; one worker processes one frame at a time, with no fixed 10 Hz cap or queued camera images.
- Full scans normally use 640 pixels on the long edge; ordinary flow frames use 320, reducing pixel readback by 75%. Separate capture canvases and returned grayscale buffers are reused. Failed acquisition periodically retries at 1000 pixels. Detection uses internal decimation 2 while locked and 1.5 for acquisition.
- Up to 80 board points are selected across verified markers. When marker corners alone are insufficient, FAST texture corners inside those verified markers supplement them. Forward/backward flow checks, patch appearance checks and robust homography fitting reject occluded or independently moving points. Flow requires at least 12 inliers from three marker IDs with spatial coverage; one visible marker still works through full detection.
- All four corners of each known tower are tracked independently of the board. Full scans discover new/moved towers and refresh identities about every 300 ms. Failed board flow triggers detection in that same cycle. A flow-only board without a fresh decoded anchor expires after one second; long frame gaps force reacquisition. Existing tower disappearance and board-loss timeouts still apply.
- The status displays point count and update rate. `?stats=1` distinguishes flow-update frequency from full-scan frequency, and reports separate flow/detection latency distributions, pyramid building, feature seeding, and the existing capture/render timings.
- `assets/apriltags/marker-manifest.json` is the board layout source of truth. Board coordinates use millimetres, the sheet centre as origin, x right, y up out of the paper, and z toward the sheet's bottom.
- On full scans, every visible field tag supplies a homography hypothesis. Inliers from the other field tags are refitted together, so corner tags are not required. One complete visible marker can anchor the plane, although multiple spread-out tags improve stability.
- Board and tower positions use the latest validated detection or flow estimate without temporal smoothing, avoiding extra lag during movement; this can expose more stationary jitter.
- Detected tower centres are inverse-projected onto that same plane; the physical tower-tag rotation does not limit its automatic aiming.
- A tower disappears and stops firing after 1.4 seconds without a validated observation. Full board loss pauses combat and hides stale overlays after 650 ms. Reacquisition resumes automatically unless manually paused.
- The ground plane aligns projectively to the detected grid. 3D height uses an approximate 60-degree camera field of view; per-device calibration could improve the vertical appearance at steep angles. There is no hand/object depth occlusion, world tracking when all tags leave view, or persistence after reload.

## Performance diagnostics

Append `?stats=1` to the app URL to show render FPS,
main-thread phase timings, asynchronous GPU time (when supported), draw calls
including shadows, and camera/detector latency. This works in production as well
as development. GPU timing is opt-in and never waits synchronously for the GPU.
In development, `window.__paperkeep.performance.snapshot` exposes the same frame
metrics. The scan-rate indicator alone does not measure rendering smoothness.

Tracking diagnostics show p50 (median) / p95 over the last 120 updates, with separate distributions for flow-only frames and frames that invoke detection:
canvas resize, drawing/scaling the video, pixel readback, grayscale conversion,
message delivery to the worker, WASM buffer allocation/copy, native detection,
JSON decoding, delivery back to the main thread, board fitting, and applying the
result. Native detection includes the vendored C wrapper's result serialization;
its internal detector stages are not separately instrumented. Cross-thread
message timings use `performance.timeOrigin` to align clocks and include message
serialization and event-loop waiting. Small timings can round to zero on phones.

`Cycle` measures capture start through application of the result. `RAF wait`
measures idle time after the previous result before the next capture; `interval`
measures capture-start to capture-start. The percentage over 16.7 ms identifies
cycles exceeding a 60 Hz processing budget. `Capture→submit` additionally includes
waiting for a rendered frame and issuing its WebGL commands; it is **not** sensor
exposure-to-screen latency, nor a GPU completion measurement. The camera setting
is the browser-reported track setting, not a measured unique camera-frame rate.
Scan frequency can exceed fresh camera-frame frequency when the camera is slower
than the display.

`scripts/profile-browser.js` is a five-second browser profiling function for a
running development page. Evaluate it with Playwright CLI's `eval` command to
sample the current camera/game/render pipeline, GPU queries, long tasks, DOM
mutations, resource counts, and the detailed tracking summary. It restores the methods it temporarily wraps.
Use the same scene and viewport for before/after comparisons; a desktop or
synthetic camera test does not establish performance on a physical phone.

The castle and existing tower/enemy objects persist across frames; arrows use a
mesh pool. Static model parts are batched with vertex colours, while limbs,
flags, health bars, and range indicators remain independent. HUD and notice
updates avoid writing unchanged DOM values. Pixel ratio and shadows retain
their original settings.

## Files

- `src/game.js`: deterministic, renderer-independent combat model.
- `src/tracking-math.js`: homography fitting, robust board estimation, and plane pose.
- `src/tracker.js`: worker/camera frame lifecycle and tower projection.
- `src/tracking-worker.js` and `src/flow-tracking.js`: AprilTag acquisition, distributed optical flow, validation, and recovery.
- `src/world.js`: original low-poly medieval castle, archers, soldiers, health bars, projectiles, and terrain in Three.js. No Age of Empires assets are used.
- `src/main.js`: camera permission flow, mobile UI, demo controls, pause/restart lifecycle.
- `public/vendor/apriltag/`: pinned detector binary, source revision, and license; its ES-module loader is in `src/vendor/`.
- `scripts/build_trackers.py`: print-kit generator. After regenerating, also copy the PDF to `public/print-kit.pdf`.

## Validation

`npm test` checks targeting/range, inactive towers, four-sided spawning, castle damage, defeat/reset/victory, robust partially occluded board fitting, one-tag recovery, inverse tower projection, and exact plane reprojection. `npm run build` checks the production bundle.

`scripts/check-tracking-motion.js` exercises the real WASM/flow worker with the committed `tests/fixtures/board-with-towers.png` synthetic camera fixture. It checks camera motion, partial/full occlusion, reacquisition, and tower discovery/movement. Run it with Playwright CLI eval against the development server.

Browser checks were run in Chromium on desktop and a 390 × 844 viewport. The real WASM detector read all 35 printed field markers. A perspective-warped image of the printed field with three tower tags was supplied through a synthetic video stream to exercise the real camera-frame/worker/render path; all three tower positions recovered within a fraction of a millimetre of their fixture positions. Partial occlusion, full tracking loss/pause, and reacquisition were exercised. This is not yet a physical-phone/camera validation: lighting, focus, motion blur, thermal limits, and device performance need a real tabletop playtest.

## References and licenses

- [ARENA AprilTag WASM](https://github.com/arenaxr/apriltag-js-standalone), BSD-3-Clause. Pinned revision is in `public/vendor/apriltag/SOURCE.txt`.
- [AprilTag marker images](https://github.com/AprilRobotics/apriltag-imgs).
- [JSFeat](https://github.com/inspirit/jsfeat), MIT; pinned to 0.0.8 and bundled locally for image pyramids, optical flow, and FAST features. Its license is in `public/vendor/jsfeat/`.
- [Three.js](https://threejs.org/), MIT.
- [Browser camera secure-context requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

Motion robustness: optical flow uses 11-pixel patches with forward/backward and geometric rejection. When fewer than 40 board points remain, full tag refreshes shorten from 300 ms to 100 ms to rebuild anchors. Severe camera blur can still prevent a valid observation; the tracker does not invent a pose through full occlusion.
