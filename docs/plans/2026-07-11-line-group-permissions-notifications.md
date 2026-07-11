# LINE Group Permissions and Upload Notifications Implementation Plan

> **For Hermes:** Implement task-by-task with RED → GREEN → REFACTOR and verify real LINE/Cloudflare boundaries.

**Goal:** Bind LINE group chats to a family album with viewer/uploader permissions, and push a safe photo preview plus uploader name when media is uploaded.

**Architecture:** Keep users and family ownership authoritative in D1. A LINE group binding grants only `viewer` or `uploader` access after the server verifies the signed-in LINE user is a current group member; group-derived sessions expire after one hour. Uploads store an immutable LINE-safe JPEG/PNG preview in R2, and notifications use an unguessable deterministic preview URL that can never access the original.

**Tech Stack:** Cloudflare Workers, D1, R2, LINE Messaging API, LIFF, TypeScript, Vitest.

---

### Task 1: Add D1 group and notification schema

**Files:**
- Create: `migrations/0002_line_groups.sql`
- Test: `tests/line-groups.test.ts`

1. Add a failing schema-contract test for `line_group_bindings`, session group context, preview metadata, and idempotent notification deliveries.
2. Run the focused test and confirm RED.
3. Add the migration with active/pending/left status, `viewer|uploader` roles, notification toggle, hashed bind token, preview metadata, and unique `(media_asset_id, line_group_binding_id)` delivery rows.
4. Re-run and confirm GREEN.

### Task 2: Handle LINE group join and secure binding

**Files:**
- Modify: `src/worker.ts`
- Test: `tests/line-groups.test.ts`

1. Add RED tests: valid join records a pending group and replies with a LIFF setup link; invalid signatures are rejected; only a direct family owner/admin can bind; group roles reject owner/admin values.
2. Implement join-event parsing, group-summary lookup, hashed one-time bind token, pending-info API, and bind API.
3. On bind, push a confirmation containing a group-specific LIFF link.
4. Confirm focused and full tests GREEN.

### Task 3: Grant short-lived group-derived access

**Files:**
- Modify: `src/worker.ts`
- Modify: `src/html.ts`
- Test: `tests/line-groups.test.ts`
- Test: `tests/worker-routes.test.ts`

1. Add RED tests proving a bound group member receives the configured family role while a non-member is rejected.
2. Verify membership using `GET /v2/bot/group/{groupId}/member/{lineUserId}`.
3. Store the binding on a one-hour session; merge group access with direct family memberships without allowing group admin/owner.
4. Parse direct query parameters and encoded `liff.state`, pass `groupBinding` during LINE auth, and prioritize the bound family in the UI.

### Task 4: Create LINE-safe upload preview

**Files:**
- Modify: `src/worker.ts`
- Modify: `src/html.ts`
- Test: `tests/line-groups.test.ts`

1. Add RED tests for a multipart upload with a JPEG preview, DNG embedded-preview storage, preview size/type validation, and token-protected public preview access.
2. Generate a max-1280px JPEG client-side for browser-decodable photos and upload it alongside the original.
3. For DNG, extract and store the embedded JPEG when it is within LINE's 1 MB preview limit.
4. Serve only the derived preview through `/api/line-preview/:assetId/:token`; never expose the original through this token.

### Task 5: Push upload notifications idempotently

**Files:**
- Modify: `src/worker.ts`
- Test: `tests/line-groups.test.ts`

1. Add RED tests proving each active subscribed group receives at most one notification per asset, with image plus uploader text when a preview exists and text fallback otherwise.
2. Claim delivery with a D1 unique row before calling LINE, use `X-Line-Retry-Key`, and record sent/failed state.
3. Run notification work through `ctx.waitUntil` after the upload transaction completes.
4. Verify notification links target the receiving group's binding.

### Task 6: Add group setup UI and documentation

**Files:**
- Modify: `src/html.ts`
- Modify: `docs/LINE_SETUP.md`
- Modify: `docs/DESIGN.md`
- Modify: `README.md`
- Test: `tests/worker-routes.test.ts`

1. Add RED source/UI contract tests for family selection, viewer/uploader selection, notification toggle, and bind action.
2. Implement the setup panel opened by the one-time group bind link.
3. Document enabling **Allow bot to join group chats**, the one-bot-per-group LINE limitation, and the setup flow.

### Task 7: Verify and ship

1. Run focused tests, `npm run check`, inline-module syntax validation, `npm run deploy:dry-run`, and `git diff --check`.
2. Apply D1 migration remotely with the explicit Cloudflare account.
3. Deploy with existing production secrets preserved.
4. Verify webhook configuration, bot group-join setting/API behavior where observable, production health, and database schema.
5. Perform a real group join/bind/upload notification smoke if a test group is available; otherwise report that single human LINE action explicitly.
6. Security scan, commit, push, and verify local/remote SHA equality.
