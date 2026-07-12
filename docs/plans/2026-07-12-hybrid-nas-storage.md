# Hybrid NAS Storage Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Store new mrnks originals on the UGREEN NAS through a resumable Cloudflare Tunnel gateway while keeping D1 authorization/metadata and R2 previews, without interrupting existing R2 assets.

**Architecture:** Existing assets remain readable from R2. New uploads are authorized by the Worker, sent in 32 MiB signed chunks to a dependency-free Node gateway, finalized and SHA-256 verified on the NAS, then committed to D1 with `original_storage_backend='nas'`. The Worker keeps all user-facing authorization, proxies signed NAS reads/Range requests, and queues backend-aware deletion. Preview objects remain in R2 so the gallery still opens while the NAS is unavailable.

**Tech Stack:** Cloudflare Workers, D1, R2, TypeScript, browser JavaScript, Node.js 22 built-ins, rclone SMB remote, Cloudflare Tunnel, systemd user services.

---

### Task 1: Add hybrid-storage schema and route contracts

**Files:**
- Create: `migrations/0004_hybrid_nas_storage.sql`
- Modify: `src/worker.ts`
- Test: `tests/gallery.test.ts`

**Steps:**
1. Write failing tests for storage backend fields and upload-init authorization.
2. Add `media_assets.original_storage_backend` with existing rows defaulted to `r2`.
3. Add `media_upload_sessions` with immutable metadata, status, expiry and unique asset ID.
4. Add `media_deletion_jobs.original_storage_backend`, default existing jobs to `r2`.
5. Add `POST /api/families/:familyId/uploads` returning a signed, one-hour NAS upload token, gateway origin and 32 MiB chunk size.
6. Verify non-members/viewers are denied and uploader/admin/owner are accepted.
7. Run targeted tests and commit.

### Task 2: Implement and test the NAS storage gateway

**Files:**
- Create: `nas-gateway/server.mjs`
- Create: `nas-gateway/lib/auth.mjs`
- Create: `nas-gateway/lib/rclone-store.mjs`
- Create: `nas-gateway/test/gateway.test.mjs`
- Create: `nas-gateway/package.json`

**Steps:**
1. Write failing Node tests using a temporary filesystem-backed test store.
2. Implement compact base64url JSON + HMAC-SHA256 tokens with action, asset ID, object key, expected size, chunk size, expiry and CORS origin claims.
3. Implement `PUT /v1/uploads/:assetId/parts/:index`, idempotent part status, and strict part-size/index validation.
4. Implement `GET /v1/uploads/:assetId` for resumable status.
5. Implement `POST /v1/uploads/:assetId/complete`; stream parts in order, compute SHA-256, write the exact original via `rclone rcat --size`, verify final size, sign a completion receipt, and purge parts.
6. Implement signed `GET`/`HEAD /v1/objects/:assetId` with single-range support and signed `DELETE`.
7. Reject traversal, expired/wrong-action tokens, oversized chunks and invalid CORS origins.
8. Add unauthenticated `/health` without topology/secrets.
9. Run gateway tests and commit.

### Task 3: Finalize NAS uploads in the Worker and abstract original reads

**Files:**
- Modify: `src/worker.ts`
- Test: `tests/gallery.test.ts`

**Steps:**
1. Write failing tests for signed completion receipts, idempotency, NAS metadata insertion and mismatch rejection.
2. Add `POST /api/uploads/:uploadId/complete`; verify receipt, verify current session/role and upload ownership, save optional R2 preview, insert the media row and mark the session ready atomically.
3. Extract backend-aware original range/full fetch helpers.
4. Keep R2 behavior unchanged for legacy rows; fetch NAS originals through short-lived signed gateway requests for `nas` rows.
5. Prefer R2 notification/gallery preview when available; use signed NAS ranges for RAW fallback.
6. Add NAS-aware content, download and Range behavior.
7. Extend durable deletion jobs so R2 and NAS objects are deleted through their respective backends and retried safely.
8. Run targeted and full tests and commit.

### Task 4: Switch the browser uploader to resumable chunks

**Files:**
- Modify: `src/html.ts`
- Test: `tests/worker-routes.test.ts`

**Steps:**
1. Write failing inline-module tests for upload initiation, 32 MiB slicing, retry, gateway completion and Worker finalization.
2. Keep client preview generation for browser-readable images.
3. Initiate an upload with filename, MIME type, size and last-modified metadata.
4. Upload chunks directly to the gateway with the signed token, retry transient failures, and consult uploaded-part status before retrying.
5. Complete at the gateway, then send the signed receipt and optional preview to the Worker.
6. Report per-file progress and continue to the next file without buffering the entire original in JavaScript.
7. Update the upload note to describe resumable NAS originals.
8. Run inline syntax, route tests and full checks; commit.

### Task 5: Deploy the gateway and Cloudflare Tunnel

**Files:**
- Create outside repo: `~/.config/mrnks/nas-gateway.env` (mode 0600)
- Create outside repo: `~/.config/systemd/user/mrnks-nas-gateway.service`
- Create outside repo: `~/.config/systemd/user/mrnks-nas-cloudflared.service`
- Create outside repo: `~/.cloudflared/mrnks-nas.yml`
- Modify: `wrangler.example.jsonc`
- Modify: `README.md`
- Modify: `docs/DESIGN.md`

**Steps:**
1. Generate a dedicated shared secret without printing it; store it in the gateway env file and as Wrangler secret `NAS_STORAGE_SECRET`.
2. Create `upload.mrnks.2-38.com` named Tunnel route to the localhost-only gateway.
3. Run gateway as an unprivileged user with rclone config and `kans-nas:Photos/mrnks` root.
4. Set `NAS_STORAGE_ORIGIN` on the Worker and deploy schema first, then Worker.
5. Health-check localhost and public Tunnel; verify unsigned storage requests fail.
6. Deploy the frontend only after gateway readiness.
7. Document rollback: disable NAS initiation while retaining legacy R2 upload/read paths.

### Task 6: Migrate existing R2 originals safely

**Files:**
- Create: `scripts/migrate-r2-originals-to-nas.mjs`
- Test: dry-run output plus production verification queries

**Steps:**
1. Implement dry-run listing from D1 and R2 without exposing IDs or filenames in logs.
2. Copy each legacy original to the NAS gateway/internal store, verify byte count and SHA-256 against D1.
3. Update each media row to `nas` only after verification; retain the R2 original during a safety window.
4. Keep preview objects in R2.
5. Add a separate explicit cleanup mode for verified R2 originals; do not run destructive cleanup until production reads pass.
6. Commit the migration tool and documentation.

### Task 7: Verify production and rollback safety

**Steps:**
1. Run all unit tests, typecheck, inline-module syntax check, Wrangler dry-run and `git diff --check`.
2. Upload and retrieve a JPEG, Sony ARW and a generated file larger than 100 MiB.
3. Verify resume after one intentionally interrupted chunk.
4. Verify SHA-256 equality, full download and byte ranges.
5. Verify unauthorized/non-member/viewer upload and NAS read rejection.
6. Stop the gateway temporarily and verify gallery metadata/R2 previews still render while originals report unavailable.
7. Restart services, verify recovery and pending deletion retry.
8. Push, deploy, run live smoke and report real deployment/service/tunnel identifiers without secrets.
