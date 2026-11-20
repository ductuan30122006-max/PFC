# ADR-011: One PFC account, platform roles, and the native Education / Marketplace / Project hubs

## Status
Accepted — 20/11/2026. Builds on ADR-009 (App Shell) and ADR-010 (hub interiors, gateway).

## Context
The member asked for these things:
- One login should work in **all six branches**.
- Functions must still be permission-checked:
  - The Chủ nhiệm can do everything.
  - A Thành viên cannot delete or kick anyone.
  - Each Trưởng ban has a clear list of what they can and cannot do.
- Education, Marketplace and Dự án (Project) must be finished, following `DATA/` (Screen Inventory: EDU-*, MKT-*, SELL-*, PRO-*; SRS FR-EDU, FR-MKT, FR-PROJ, §9 lifecycles).

## Decision

### 1. One account (single sign-on through the gateway)
- **PFC-App is the identity provider.** The `members` table holds the account.
- **Token exchange.** For each Club or Opportunity request, the gateway `/api/hub/{club|opp}/…` mints a 60 s HS256 platform token:
  - `iss` is `pfc-platform`.
  - `aud` is `pfc-club` or `pfc-opportunity`.
  - It is signed with a per-hub shared secret (`CLUB_SSO_SECRET`, `OPP_SSO_SECRET`).
  - The gateway exchanges it server-side: Club `POST /api/club/sso/session`, Opportunity `POST /api/auth/sso`.
- **Session binding.** The hub session cookie is bound to the PFC member with an HMAC `<cookie>_owner` tag, so a stale cookie can never act as someone else. On a 401 the gateway re-exchanges and retries once.
- **Sign-in and sign-out.** Logging in to or out of PFC clears every hub cookie. Password login to the hubs is blocked at the gateway.
- **Club stays a private club.** A new account still sees the join screen and needs approval. SSO does not create a membership.

### 2. Platform roles (`src/platform/roles.ts`)
- **Roles:** `chu_nhiem`, `ban_dieu_hanh`, `truong_ban` (+ department `chuyen_mon` | `truyen_thong` | `su_kien`), `thanh_vien`.
- **Permissions** are named (`edu.*`, `mkt.*`, `project.*`, `admin.*`) and checked in every service, never only in the UI.
- **Who gets what:**

  | Role | Permissions |
  |---|---|
  | Chủ nhiệm | All |
  | Ban điều hành | Moderation set, without role management, account locking or `project.manage_any` |
  | Trưởng ban Chuyên môn | Education content, forum moderation, project approval |
  | Trưởng ban Truyền thông | Forum moderation, Marketplace listing approval |
  | Trưởng ban Sự kiện | Forum moderation |
  | Thành viên | None, but manages their own content |

- **Account administration:**
  - Only a Chủ nhiệm changes roles, and the last Chủ nhiệm can never be removed.
  - A locked account has no permissions and is treated as signed out.
  - Emails in `PFC_OWNER_EMAILS` become Chủ nhiệm when they register.
- **Club** permissions stay in the Club service (`POSITION_PERMISSIONS`). A member gets 403 on kick and on approve, which was verified live.
- The **"Phân quyền"** screen (`/more/roles`) shows three matrices: platform, Club, and in-project.

### 3. Shared content workflow (`src/platform/workflow.ts`)
- **States:** draft → submitted → published → archived, plus rejected. A rejection always needs a reason.
- **Self-approval:** an author who is also an approver publishes directly.
- **Used by:** courses, quizzes, resources and Marketplace listings.

### 4. Native hubs (in PFC-App, central libSQL DB, migrations v3–v5)
Each hub follows the same layout: `src/modules/<hub>/{domain (pure, tested), server/service.ts (actor-based, tested on a temp DB), server/actions.ts}`, plus its own 5-tab interior.

- **Education** (`/learn`):
  - Courses, lessons (YouTube/Vimeo embeds, https only), enrolment, progress and certificates.
  - Quizzes: answers are never sent to the client, and an attempt is visible to its owner only.
  - Resources.
  - A forum with like, lock and hide.
  - A manage area for content creators and approvers.
- **Marketplace** (`/market`):
  - **Sellers:** a seller registers and is approved by `mkt.seller.approve` (risk-based, Q04). Listings are approved by `mkt.listing.approve`, and editing a published listing sends it back for review.
  - **Cart and checkout:**
    - Checkout splits the cart by seller.
    - Stock is decremented in an interactive transaction.
    - The checkout key makes it idempotent.
    - Prices come from the server.
  - **Order lifecycle:** placed → confirmed → shipping → delivered → completed, or cancelled.
    - A bank transfer must be marked paid before shipping.
    - The buyer can cancel only while the order is placed. The seller can cancel with a reason until shipping.
    - Cancelling restores stock.
    - Reviews are allowed only on completed orders.
  - **Payments:** PFC does not hold money. VNPAY is a later phase, as the SRS sets out.
- **Dự án / Project** (`/projects`):
  - **Lifecycle (SRS §9):** draft → submitted → active → completed → archived, plus rejected (reason required). Approval needs `project.approve`.
  - **In-project roles:**
    - **Chủ dự án** (owner): the only one who removes members or changes roles.
    - **Trưởng nhóm** (lead): admits members and manages all tasks, but cannot kick anyone.
    - **Thành viên dự án** (member): self-assigns tasks and moves them to "review", but cannot close them.
    - **Mentor:** comments within an agreed scope.
  - **Staff override:** a Chủ nhiệm (`project.manage_any`) can step into any project, but can never remove the owner.
  - **Links:** https only, public or team-only.
  - **Feedback:** from non-members only, one per person. Approvers can hide feedback; the owner cannot hide criticism.
  - **Analytics** for the owner and lead: views (one per member per day), team, progress, overdue tasks and rating.

## Consequences
- **Tests:** 143 unit and service tests, including permission tests for every role boundary the member listed. Every hub flow was browser-tested on a 375 px viewport with the demo accounts from `npm run db:seed`.
- **Seed:** `scripts/seed-hubs.ts` deliberately seeds **no** courses, listings or projects. Content comes from members, so no business data is invented (AGENTS rule 8).
- **Not built yet:** paid collaboration (Q08), VNPAY, image/file uploads (links only) and notifications for hub events.
