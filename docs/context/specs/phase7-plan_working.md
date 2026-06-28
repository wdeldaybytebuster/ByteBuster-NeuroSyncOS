**Document Summary: Phase 7 Network Isolation & Deployment Prep Plan**

===

# Phase 7: Network Isolation & Deployment Prep

Phase 7 hardens the application for the specific hardware profile of the Lenovo IdeaPad Slim 3 Chromebook (i3-N305, 8 E-Cores, 8GB RAM). It applies strict resource capping to prevent Wayland OOM compositor crashes and finalizes the production build pipeline.

### Unit 31: Garcon Bypass & Chrome Isolation
**Goal:** Intercept and bypass the Garcon loopback bridging daemon for CDP and Chromium rendering.
- Ensure all web scraping and browser automation (including Cloak browser configuration for Scrapling) forces the executable path to the native Linux binary at `/usr/bin/google-chrome-beta`.
- Prevent accidental invocation of the Chrome OS host browser (which causes TCP/WebSocket CDP failures across the VM bridge).

### Unit 32: Thermodynamic Resource Capping
**Goal:** Enforce strict V8 and libuv limits to prevent thermal throttling and OOM eviction on the 15W TDP processor.
- Implement `NODE_OPTIONS="--max-old-space-size=1024"` across all start scripts.
- Cap `UV_THREADPOOL_SIZE=3` to ensure I/O operations leave cores free for KuzuDB/LadybugDB and Llama.cpp inference.
- Apply maximum worker limits to Vite/Vitest configurations (`--no-threads` or `maxWorkers=2`).

### Unit 33: Production Build Pipeline & Gateway
**Goal:** Combine the separate frontend (Vite dev server, Port 3742) and backend (Hono, Port 3743) into a single optimized process.
- Configure Vite to build the React application into a static `dist` folder.
- Configure Hono API Gateway to serve `dist` via `@hono/node-server/serve-static` on port 3743.
- Create a unified `start` script (`npm start`) that boots the standalone sovereign OS cockpit cleanly.

## Acceptance Criteria for Phase 7
- [x] Browser executable paths explicitly target `/usr/bin/google-chrome-beta`.
- [x] Environment variables limit memory footprint to 1GB and thread pool to 3.
- [x] Running `npm run build` cleanly compiles the frontend.
- [x] Running `npm start` launches a single Node process on Port 3743 that serves both the UI and the API Gateway.


=== 
<!-- Append-only log of changes — newest first -->

**Date:** 2026-06-26
**Agent:** Maintenance Agent (Antigravity)

- System-wide TypeScript type resolution completed.
- Backend type errors (165 tests) passing and cleared.
- Successfully bootstrapped missing dependencies in Next.js `ui-next` directory.
- Root TSConfig optimized for monorepo separation.
- Unfinished tasks in `ts-errors.txt` successfully verified and marked as complete.


### [2026-06-26] UI Overhaul - Full Dashboard Suite Redesign Complete
- Fully redesigned and refactored **BaseVault**, **PortGrid**, **ScopeLogic**, **CoreExec**, **RouteSwitch**, **ScoutDaemon**, and **Cerebro** dashboards.
- Applied the "Grit, Not Grime" zero-budget, high-reliability local execution design philosophy.
- Transitioned to "High-Glow" dynamic themes tailored to each module's core function.
- Finalized global styling variables in `index.css`.
- Synchronized all module routes inside `OSLayout.tsx` and `App.tsx` ensuring 100% cohesion across the suite.
