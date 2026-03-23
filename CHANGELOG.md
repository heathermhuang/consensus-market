# Changelog

## 1.0.1 - 2026-03-22

- tightened UX, QA, and edge-security behavior across the market experience
- simplified the company profile section so it matches the rest of the page system
- hardened Worker responses for runtime, news, and RPC endpoints with consistent security headers
- added explicit production validation and deployment workflows
- added a production runbook for release, verification, and rollback
- split the frontend into smaller runtime chunks and lazy-loaded the market research panels
- removed the broken demo-chain tunnel config from production so the live site runs in honest scenario mode
- added a live browser smoke test and legacy-host client redirect for `capital.markets`
