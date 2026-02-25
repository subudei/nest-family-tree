# Family Tree Application — Master Source of Truth

> **Last updated:** February 25, 2026 (v3 — validation hardening + frontend sync)
> **Purpose:** Single reference document for any AI agent or developer working on this project. Covers what exists, what works, what's broken, and what's planned.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Backend — What's Built (nest-family-tree)](#3-backend--whats-built)
4. [Frontend — What's Built (next-family-tree)](#4-frontend--whats-built)
5. [What's Done & Working](#5-whats-done--working)
6. [What's Broken or Incomplete](#6-whats-broken-or-incomplete)
7. [Testing Status](#7-testing-status)
8. [Roadmap — What Needs to Be Done](#8-roadmap--what-needs-to-be-done)
9. [Existing Documentation Index](#9-existing-documentation-index)

---

## 1. Project Overview

A **Family Tree Visualization Application** with two separate codebases:

| App          | Tech                                      | Location            | Port |
| ------------ | ----------------------------------------- | ------------------- | ---- |
| **Backend**  | NestJS 11, TypeORM, SQLite                | `nest-family-tree/` | 3001 |
| **Frontend** | Next.js 15, React 19, Tailwind, shadcn/ui | `next-family-tree/` | 3000 |

**What it does:**

- Users register with an email, create a family tree, and get admin credentials
- Admins add/edit/delete persons, manage partnerships, build a visual family tree
- Admins create guest credentials to share read-only access with relatives
- System admins (platform administrators) manage all trees and users via a separate dashboard

**Two-app architecture:** The frontend is a standalone Next.js app that calls the NestJS REST API. They are separate repos/folders, deployed independently.

---

## 2. Architecture

```
┌──────────────────────┐      HTTP/REST       ┌──────────────────────┐
│   next-family-tree   │  ──────────────────▶  │  nest-family-tree    │
│   (Next.js 15)       │  ◀──────────────────  │  (NestJS 11)         │
│   Port 3000          │      JSON responses   │  Port 3001           │
└──────────────────────┘                       └──────────┬───────────┘
                                                          │
                                                          │ TypeORM
                                                          ▼
                                               ┌──────────────────────┐
                                               │  SQLite              │
                                               │  family-tree-db.sqlite│
                                               └──────────────────────┘
```

### Auth Model (3 user types)

| Type                   | Login Method              | JWT Payload                                | Access                                |
| ---------------------- | ------------------------- | ------------------------------------------ | ------------------------------------- |
| **Owner** (tree admin) | Email + password          | `{ sub: userId, type: 'owner', email }`    | Full CRUD on own trees                |
| **Guest** (viewer)     | Guest username + password | `{ sub: treeId, type: 'guest', treeName }` | Read-only on one tree                 |
| **System Admin**       | Username + password       | `{ sub: adminId, role: 'systemadmin' }`    | All trees, all data, admin management |

---

## 3. Backend — What's Built

### 3.1 Database (SQLite — file-based)

- **Config:** `app.module.ts` → `type: 'sqlite'`, `synchronize: true`
- **File:** `family-tree-db.sqlite`
- **No migrations** — schema auto-syncs from entities (dev-only approach)
- **No Postgres driver installed** — only `sqlite3`

### 3.2 Entities

#### Person

| Column                   | Type               | Notes                                                                |
| ------------------------ | ------------------ | -------------------------------------------------------------------- |
| `id`                     | int (auto PK)      |                                                                      |
| `treeId`                 | string (FK → Tree) | CASCADE delete                                                       |
| `firstName`, `lastName`  | string             | required                                                             |
| `gender`                 | varchar(10)        | `'male'` or `'female'` — SQLite workaround, no DB enum               |
| `birthDate`, `deathDate` | text, nullable     | ISO 8601 strings (supports partial: "1990", "1990-06", "1990-06-15") |
| `trivia`                 | text, nullable     |                                                                      |
| `deceased`               | boolean            | default false                                                        |
| `progenitor`             | boolean            | default false                                                        |
| `fatherId`, `motherId`   | int, nullable      | **Plain columns, NOT TypeORM relations** (FIXME in code)             |
| `createdAt`              | Date, auto         | ✅ Added Feb 25, 2026                                                |
| `updatedAt`              | Date, auto         | ✅ Added Feb 25, 2026                                                |

#### Partnership

| Column                                         | Type           | Notes                          |
| ---------------------------------------------- | -------------- | ------------------------------ |
| `id`                                           | int (auto PK)  |                                |
| `treeId`                                       | string         | Plain column, no FK constraint |
| `person1Id`, `person2Id`                       | int            | Plain columns, no FK           |
| `marriageDate`, `marriagePlace`, `divorceDate` | text, nullable |                                |
| `divorced`                                     | boolean        | default false                  |
| `notes`                                        | text, nullable |                                |

#### Tree

| Column                   | Type               | Notes          |
| ------------------------ | ------------------ | -------------- |
| `id`                     | uuid (auto PK)     |                |
| `name`                   | string             |                |
| `guestUsername`          | string, unique     |                |
| `guestPasswordHash`      | string             |                |
| `ownerId`                | string (FK → User) | CASCADE delete |
| `createdAt`, `updatedAt` | Date, auto         |                |

#### User

| Column                   | Type             | Notes                   |
| ------------------------ | ---------------- | ----------------------- |
| `id`                     | uuid (auto PK)   |                         |
| `email`                  | string, unique   |                         |
| `passwordHash`           | string           |                         |
| `firstName`, `lastName`  | string, nullable |                         |
| `resetPasswordToken`     | string, nullable | For password reset flow |
| `resetPasswordExpires`   | Date, nullable   |                         |
| `createdAt`, `updatedAt` | Date, auto       |                         |

#### SystemAdmin

| Column                   | Type               | Notes                          |
| ------------------------ | ------------------ | ------------------------------ |
| `id`                     | uuid (auto PK)     |                                |
| `username`               | string, unique     |                                |
| `passwordHash`           | string             |                                |
| `email`                  | string, nullable   |                                |
| `displayName`            | string             | default 'System Administrator' |
| `isActive`               | boolean            | default true                   |
| `lastLoginAt`            | datetime, nullable |                                |
| `createdAt`, `updatedAt` | auto               |                                |

### 3.3 API Endpoints (All Implemented)

#### Auth (`/auth`)

| Method | Path                    | Auth      | Description                                    |
| ------ | ----------------------- | --------- | ---------------------------------------------- |
| POST   | `/auth/register`        | None      | Create User + first Tree, returns JWT          |
| POST   | `/auth/login/owner`     | None      | Email + password → JWT + trees list            |
| POST   | `/auth/login/guest`     | None      | Guest username + password → JWT                |
| POST   | `/auth/forgot-password` | None      | Generate reset token (email logged to console) |
| POST   | `/auth/reset-password`  | None      | Validate token, reset password                 |
| GET    | `/auth/me`              | JWT       | Current user info (owner or guest)             |
| GET    | `/auth/profile`         | JWT+Admin | Owner profile + trees                          |
| PATCH  | `/auth/profile`         | JWT+Admin | Update name, email, password                   |

#### Persons (`/persons`)

| Method | Path                         | Auth      | Description                              |
| ------ | ---------------------------- | --------- | ---------------------------------------- |
| POST   | `/persons`                   | JWT+Admin | Create person (extensive validation)     |
| GET    | `/persons`                   | JWT       | List all (optional `?name=` search)      |
| GET    | `/persons/progenitor`        | JWT       | Get root ancestor                        |
| GET    | `/persons/:id`               | JWT       | Get single person                        |
| PATCH  | `/persons/:id`               | JWT+Admin | Update person                            |
| DELETE | `/persons/:id`               | JWT+Admin | Delete person (blocks if has children)   |
| POST   | `/persons/promote-ancestor`  | JWT+Admin | Create new root above current progenitor |
| DELETE | `/persons/orphans`           | JWT+Admin | BFS-based orphan cleanup                 |
| PATCH  | `/persons/:id/link-children` | JWT+Admin | Link person as parent to children        |
| GET    | `/persons/partnerships/all`  | JWT       | All partnerships for tree                |
| GET    | `/persons/partnerships/pair` | JWT       | Partnership by person pair               |
| POST   | `/persons/partnerships`      | JWT+Admin | Create/update partnership                |

**Tree resolution:** Owner JWT uses `X-Tree-Id` header (verified against ownership), Guest JWT uses treeId from token.

#### Trees (`/trees`)

| Method | Path                        | Auth      | Description                   |
| ------ | --------------------------- | --------- | ----------------------------- |
| GET    | `/trees`                    | JWT+Admin | List owner's trees            |
| POST   | `/trees`                    | JWT+Admin | Create new tree               |
| GET    | `/trees/:id`                | JWT       | Get tree details              |
| PATCH  | `/trees/:id`                | JWT+Admin | Rename tree                   |
| PATCH  | `/trees/:id/guest-password` | JWT+Admin | Change guest password         |
| DELETE | `/trees/:id`                | JWT+Admin | Delete tree + CASCADE persons |

#### System Admin (`/system-admin`)

| Method | Path                             | Auth     | Description                           |
| ------ | -------------------------------- | -------- | ------------------------------------- |
| POST   | `/system-admin/login`            | None     | System admin login (separate JWT)     |
| GET    | `/system-admin/me`               | SysAdmin | Current admin info                    |
| GET    | `/system-admin/dashboard`        | SysAdmin | Stats (trees, persons, admins)        |
| GET    | `/system-admin/trees`            | SysAdmin | Paginated tree list with search       |
| GET    | `/system-admin/trees/:id`        | SysAdmin | Tree detail + all persons             |
| DELETE | `/system-admin/trees/:id`        | SysAdmin | Delete tree                           |
| GET    | `/system-admin/trees/:id/export` | SysAdmin | Export tree as JSON                   |
| PATCH  | `/system-admin/persons/:id`      | SysAdmin | Update any person                     |
| DELETE | `/system-admin/persons/:id`      | SysAdmin | Delete any person                     |
| GET    | `/system-admin/admins`           | SysAdmin | List all system admins                |
| POST   | `/system-admin/admins`           | SysAdmin | Create system admin                   |
| PATCH  | `/system-admin/admins/:id`       | SysAdmin | Update system admin                   |
| DELETE | `/system-admin/admins/:id`       | SysAdmin | Deactivate (soft delete, blocks self) |

### 3.4 Business Logic Highlights

- **Person validation (backend):** Parent gender check, minimum parent age (14), maximum parent age (father ≤ 120, mother ≤ 70), implicit max lifespan (120 years when no death date), birth year ≥ 1, death-after-birth check, birth date logic with partial-date support, father 9-month conception rule, cycle detection (BFS), orphan prevention
- **Frontend validation sync:** All 3 person forms (AddPersonForm, AddParentForm, EditPersonForm) enforce the same constants client-side: `MIN_PARENT_AGE=14`, `MAX_FATHER_AGE=120`, `MAX_MOTHER_AGE=70`, `MAX_LIFESPAN=120`, `MIN_BIRTH_YEAR=1`. Parent dropdowns are age-filtered to only show eligible candidates.
- **Promote ancestor:** Transactional — creates new person, updates current progenitor's fatherId/motherId, transfers progenitor flag
- **Orphan cleanup:** BFS from progenitor, deletes any disconnected persons
- **System admin seeding:** First admin auto-created from env vars on startup

---

## 4. Frontend — What's Built

### 4.1 Tech Stack

- Next.js 15.5.3 with App Router, React 19, TypeScript
- Tailwind CSS 4, shadcn/ui components, Radix UI primitives
- React Query (`@tanstack/react-query`) for server state
- React Hook Form + Zod for forms
- **No mock data** — all API calls hit `NEXT_PUBLIC_API_URL`

### 4.2 Pages (All Complete)

| Route               | Description                                    |
| ------------------- | ---------------------------------------------- |
| `/`                 | Login page (owner/guest toggle)                |
| `/signup`           | Registration form                              |
| `/reset-password`   | Token-based password reset                     |
| `/tree`             | Main family tree visualization (auth-gated)    |
| `/admin/login`      | System admin login                             |
| `/admin/dashboard`  | Stats dashboard                                |
| `/admin/trees`      | Tree management (list, search, export, delete) |
| `/admin/trees/[id]` | Tree detail with persons table                 |
| `/admin/admins`     | System admin CRUD                              |

### 4.3 Components (All Complete)

| Component               | Lines | Description                                                                                                 |
| ----------------------- | ----- | ----------------------------------------------------------------------------------------------------------- |
| **FamilyTree**          | ~550  | Recursive tree rendering with branch colors, connecting lines, marriage blocks                              |
| **PersonCard**          | —     | Detail modal (dates, parents, children, trivia, admin actions)                                              |
| **AdminPanel**          | —     | Sidebar: tree switcher, search, create person button, profile, logout                                       |
| **AdminProfileModal**   | ~1135 | Accordion: edit name, email, password, guest password, add tree                                             |
| **LoginForm**           | —     | Owner/guest toggle, forgot password link                                                                    |
| **RegisterForm**        | —     | Account + tree + guest credentials                                                                          |
| **AddPersonForm**       | ~506  | Full person creation with age-based parent eligibility filtering (synced with backend rules)                |
| **AddParentForm**       | ~694  | Create new parent or link existing person, sibling linking, age-filtered dropdowns + create-mode validation |
| **EditPersonForm**      | ~421  | Edit all person fields including parent reassignment with full age-based filtering                          |
| **EditPartnershipForm** | —     | Marriage/divorce details                                                                                    |
| **MarriageModal**       | ~301  | Partnership details with edit mode                                                                          |
| **PromoteAncestorForm** | —     | Create ancestor above current progenitor                                                                    |
| **ForgotPasswordModal** | —     | Email → API → success state                                                                                 |

### 4.4 State Management

| Layer                      | Implementation                                                                                                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AuthContext**            | Owner/guest auth with login, logout, register, selectTree, multi-tree support                                                                                                                                  |
| **SystemAdminAuthContext** | Separate auth for `/admin` routes                                                                                                                                                                              |
| **React Query hooks**      | `usePersons`, `useProgenitor`, `useCreatePerson`, `useUpdatePerson`, `useDeletePerson`, `usePromoteAncestor`, `useLinkParentToChildren`, `useDeleteOrphanedPersons`, `usePartnerships`, `useUpsertPartnership` |

### 4.5 API Layer

All in `src/api/` — uses fetch with auth headers from localStorage. Auto-redirects on 401.

| File             | Functions                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.ts`        | register, loginOwner, loginGuest, getMe, getProfile, updateProfile, forgotPassword, resetPassword                                                        |
| `persons.ts`     | fetchPersons, fetchProgenitor, createPerson, updatePerson, deletePerson, promoteAncestor, linkParentToChildren, deleteOrphanedPersons, partnerships CRUD |
| `trees.ts`       | getMyTrees, createTree, updateTree, updateGuestPassword, deleteTree                                                                                      |
| `systemAdmin.ts` | login, getMe, getDashboard, trees CRUD, person CRUD, admin CRUD                                                                                          |

### 4.6 Helpers

| File                            | Description                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `helpers/family.ts` (566 lines) | Tree traversal: transformToPersonObjects, findProgenitor, getChildren, getSiblings, getSpouses, isBloodRelative, branch coloring, generation levels |
| `utils/dateHelpers.ts`          | Flexible date formatting (year-only, year-month, full date)                                                                                         |
| `utils/layoutEngine.ts`         | Layout engine class — **implemented but unused** (CSS layout used instead)                                                                          |
| `helpers/tree.ts`               | **Empty placeholder file**                                                                                                                          |

---

## 5. What's Done & Working

### ✅ Fully Implemented & Functional

**Backend Core:**

- [x] Dual-login auth system (owner email+password / guest username+password) with JWT
- [x] Registration flow (creates User + first Tree)
- [x] Password reset flow (token generation + validation)
- [x] Tree CRUD with ownership verification
- [x] Person CRUD with extensive validation (parent gender, birth dates, cycle detection, orphan prevention)
- [x] Partnership create/read/update
- [x] Promote ancestor (transactional, progenitor flag transfer)
- [x] Orphan cleanup (BFS-based)
- [x] Link children to existing parent
- [x] System admin panel (separate auth, dashboard, tree management, admin management, export)
- [x] System admin seeding from env vars
- [x] All DTOs with class-validator decorators
- [x] All guards (JWT, AdminGuard, SystemAdminGuard)

**Frontend Core:**

- [x] All pages implemented and functional
- [x] Full API integration (no mock data)
- [x] Auth context (owner + guest) with token persistence
- [x] System admin auth context (separate)
- [x] React Query for all data fetching with cache invalidation
- [x] Interactive family tree visualization with branch colors and connecting lines
- [x] All CRUD forms with Zod validation
- [x] Multi-tree support (tree switcher in admin panel)
- [x] Role-based UI (admin sidebar vs guest read-only)
- [x] Person search
- [x] Partnership management
- [x] Profile editing (name, email, password, guest credentials)

---

## 6. What's Broken or Incomplete

### 🔴 Known Issues

| Issue                                                   | Location                                                                       | Impact                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| ~~**JWT secret mismatch**~~                             | ~~SystemAdminGuard vs JWT strategy~~                                           | ✅ **FIXED Feb 25, 2026** — both now use same fallback                           |
| **Person parent columns are plain ints, not relations** | `person.entity.ts` — `fatherId`/`motherId` are `@Column()` not `@ManyToOne()`  | No cascade/FK integrity at DB level, manual lookups required                     |
| **Partnership has no FK constraints**                   | `partnership.entity.ts` — `treeId`, `person1Id`, `person2Id` are plain columns | No referential integrity                                                         |
| ~~**Person entity missing `createdAt`**~~               | ~~`person.entity.ts`~~                                                         | ✅ **FIXED Feb 25, 2026** — `createdAt`/`updatedAt` added, dashboard query fixed |
| **Email service is a dev stub**                         | `email.service.ts` — logs to console, no transport library                     | Password reset emails never actually send                                        |
| **No email library installed**                          | `package.json`                                                                 | Need nodemailer, SendGrid, or similar                                            |
| ~~**Tests are broken/nonexistent**~~                    | ~~All spec files are stubs~~                                                   | ✅ **FIXED Feb 25, 2026** — 3 suites, 72 tests, all passing                      |
| **`synchronize: true`**                                 | `app.module.ts`                                                                | Unsafe for production — can drop data                                            |

### 🟡 Minor Loose Ends

| Item                                       | Location                                                 |
| ------------------------------------------ | -------------------------------------------------------- |
| Empty `src/helpers/tree.ts`                | Frontend — unused placeholder                            |
| Unused `src/utils/layoutEngine.ts`         | Frontend — superseded by CSS layout                      |
| Empty `src/components/ui/` folder          | Frontend — UI components are at `components/ui/` instead |
| ~~`personsAddedThisMonth` hardcoded to 0~~ | ✅ **FIXED** — now queries Person.createdAt              |
| `request.http` partially outdated          | Some requests missing auth headers from pre-auth era     |

---

## 7. Testing Status

### Current State: ✅ 3 Suites, 72 Tests, All Passing

| File                                     | Status            | Details                                                                                                                                                                       |
| ---------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app.controller.spec.ts`             | ✅ Passing (1)    | Tests `getHello()`                                                                                                                                                            |
| `src/persons/persons.controller.spec.ts` | ✅ Passing (14)   | resolveTreeId, CRUD delegation, partnership endpoints                                                                                                                         |
| `src/persons/persons.service.spec.ts`    | ✅ Passing (57)   | Create, date validation, find, delete, update, promoteAncestor, linkChildren, deleteOrphans, children validation, partnerships, max parent age, implicit lifespan, year range |
| `test/app.e2e-spec.ts`                   | Default scaffold  | Tests `GET /` → `'Hello World!'`                                                                                                                                              |
| **Frontend**                             | **No test files** | No test runner configured (no jest/vitest in next-family-tree)                                                                                                                |

### Testing Plan (Priority Order)

#### Phase T1: Fix & Establish Backend Unit Tests

1. **Fix broken spec files** — provide proper mock providers
2. **PersonsService tests** (highest value — most complex logic):
   - Person creation with parent validation
   - Gender enforcement on parents
   - Birth date validation (partial dates, minimum parent age)
   - Cycle detection (ancestry loops)
   - Orphan detection logic
   - Promote ancestor transaction
   - Link children to parent
3. **AuthService tests:**
   - Registration (User + Tree creation, password hashing)
   - Owner login (correct/wrong password, email lookup)
   - Guest login (correct/wrong password)
   - Password reset token generation + validation
   - JWT payload structure
4. **TreesService tests:**
   - CRUD operations
   - Guest username uniqueness
   - Ownership verification
5. **SystemAdminService tests:**
   - Seeding from env vars
   - Dashboard stats aggregation
   - Export format
   - Admin CRUD (self-deactivation block)

#### Phase T2: Backend Integration / E2E Tests

1. **Auth flow E2E:** Register → Login → Access tree → Guest login → Read-only check
2. **Person CRUD E2E:** Create progenitor → Add spouse → Add child → Edit → Delete
3. **Partnership E2E:** Create → Update → Divorce
4. **Multi-tree E2E:** Create second tree → Switch → Verify isolation
5. **System admin E2E:** Login → Dashboard → Manage trees → Manage admins

#### Phase T3: Frontend Tests

1. **Install testing framework** (Vitest + React Testing Library recommended for Next.js 15)
2. **Component tests:**
   - LoginForm (owner/guest toggle, validation)
   - RegisterForm (validation, submission)
   - AddPersonForm (parent filtering, date validation)
   - FamilyTree rendering (mock persons data)
3. **Hook tests:**
   - React Query hooks with MSW (Mock Service Worker)
4. **Integration tests:**
   - Auth flow (login → redirect → tree page)
   - Person CRUD flow
5. **E2E (Playwright/Cypress):**
   - Full user journey: register → create tree → add persons → view tree → guest login

---

## 8. Roadmap — What Needs to Be Done

### Phase 1: Testing & Stability (Current Priority)

- [x] ~~Fix broken backend test files~~ (done Feb 25, 2026 — added proper mocks for PersonsService + PersonsController)
- [x] ~~Write unit tests for PersonsService~~ (done Feb 25, 2026 — 57 tests covering create, date validation, find, delete, update, promoteAncestor, linkChildren, deleteOrphans, children validation, partnerships, max parent age, implicit lifespan, year range)
- [x] ~~Write unit tests for PersonsController~~ (done Feb 25, 2026 — 14 tests covering resolveTreeId, CRUD endpoints, partnership endpoints)
- [x] ~~Fix JWT secret mismatch between SystemAdminGuard and JWT strategy~~ (done Feb 25, 2026)
- [ ] Write unit tests for AuthService
- [ ] Write unit tests for TreesService
- [ ] Write E2E tests for core flows
- [ ] Set up frontend testing (Vitest + RTL)

> **Current test status: 3 suites, 72 tests, all passing**

### Phase 2: Code Quality & Refactoring

- [ ] Convert `fatherId`/`motherId` to proper TypeORM `@ManyToOne` relations
- [ ] Add FK constraints to Partnership entity
- [x] ~~Add `createdAt` column to Person entity~~ (done Feb 25, 2026)
- [x] ~~Fix `personsAddedThisMonth` in system admin dashboard~~ (done Feb 25, 2026)
- [ ] Clean up empty/unused files (tree.ts, layoutEngine.ts, components/ui/)
- [ ] Update `request.http` with proper auth headers
- [ ] Extract hardcoded JWT secrets to env-only (remove fallbacks)
- [ ] Add consistent error handling across all services

### Phase 3: Migrate to PostgreSQL + Docker

> Detailed plan exists in `MIGRATION_AND_DEPLOYMENT.md`

- [ ] Install Docker + create `docker-compose.yml` with Postgres 16
- [ ] Install `pg` driver, remove `sqlite3`
- [ ] Install `@nestjs/config`, create `.env` + `.env.example`
- [ ] Update `app.module.ts` to use `ConfigModule` + Postgres config
- [ ] Fix entity types for Postgres (enum for gender, varchar for dates, timestamp for lastLoginAt)
- [ ] Create `data-source.ts` for TypeORM CLI
- [ ] Add migration scripts to `package.json`
- [ ] Generate and run initial migration
- [ ] Remove `synchronize: true`
- [ ] Test full flow with Postgres

### Phase 4: Email Service (Real Implementation)

- [ ] Install nodemailer (or SendGrid/SES SDK)
- [ ] Configure SMTP settings via env vars
- [ ] Implement actual `sendEmail()` transport
- [ ] Test password reset email delivery
- [ ] Add email verification on registration (optional)

### Phase 5: Production Deployment

> Detailed plan exists in `MIGRATION_AND_DEPLOYMENT.md`

- [ ] Push both repos to GitHub
- [ ] Deploy database + backend on Railway (or Render)
- [ ] Deploy frontend on Vercel
- [ ] Set production env vars (JWT_SECRET, DB credentials, CORS, API URL)
- [ ] Verify CORS is restricted to frontend domain only
- [ ] Verify `synchronize: true` is off in production
- [ ] Optional: custom domain setup

### Phase 6: Person Images & Gallery

> **Scope:** Profile avatar + photo gallery per person. Local filesystem for dev, cloud (R2/S3) for prod.

#### Data Model

```
Person (existing)
  └── profileImageUrl: string (nullable)    ← avatar shown on PersonCard

PersonMedia (new entity, 1:many)
  id: int (PK)
  personId: int (FK → Person)
  treeId: string (FK → Tree)
  type: 'image' | 'document'               ← extensible for future doc support
  url: string                               ← file path or CDN URL
  filename: string                          ← original filename
  mimeType: string                          ← 'image/jpeg', etc.
  size: number                              ← bytes
  caption: string (nullable)
  sortOrder: number                         ← gallery ordering
  createdAt: Date
```

#### Limits

| Type           | Max Size                      | Max Count/Person | Formats        |
| -------------- | ----------------------------- | ---------------- | -------------- |
| Avatar         | 2MB (auto-resize to ~400x400) | 1                | jpg, png, webp |
| Gallery photos | 5MB each                      | 20               | jpg, png, webp |

#### API Endpoints (Backend)

| Method | Path                          | Auth      | Description                          |
| ------ | ----------------------------- | --------- | ------------------------------------ |
| POST   | `/persons/:id/media`          | JWT+Admin | Upload file (multipart/form-data)    |
| GET    | `/persons/:id/media`          | JWT       | List all media for person            |
| DELETE | `/persons/:id/media/:mediaId` | JWT+Admin | Delete file                          |
| PATCH  | `/persons/:id/profile-image`  | JWT+Admin | Set media item as profile image      |
| GET    | `/uploads/:filename`          | Public    | Serve file (local) or redirect (CDN) |

#### Frontend UX

- **PersonCard in tree** → circular avatar thumbnail (initials fallback if no image)
- **Person detail modal** → larger avatar + "Gallery" tab with photo carousel
- **Admin actions** → "Upload Photo" button, set-as-profile-pic, delete
- **Guest view** → can view images but not upload

#### Storage Strategy

- **Dev:** Local filesystem (`/uploads/{treeId}/{personId}/filename`)
- **Prod:** Cloudflare R2 (free up to 10GB + 10M reads/mo) or S3
- Backend uses a storage adapter pattern so switching is a config change

#### Implementation Tasks

- [ ] Create `PersonMedia` entity
- [ ] Add `profileImageUrl` column to Person entity
- [ ] Create media upload endpoint with multer
- [ ] Add file validation (size, type, count limits)
- [ ] Create static file serving endpoint
- [ ] Create `usePersonMedia` React Query hooks
- [ ] Build avatar component (circular image with initials fallback)
- [ ] Build photo gallery/carousel in person detail modal
- [ ] Build upload UI in edit person flow
- [ ] Add set-as-profile-image action
- [ ] System admin: view/delete media for any person

### Phase 7: Future Enhancements

- [ ] Tree sharing via unique URL/slug
- [ ] Export to PDF / GEDCOM format
- [ ] Import tree from JSON backup
- [ ] Audit logging for system admin actions
- [ ] Rate limiting on auth endpoints
- [ ] Two-factor authentication for system admins
- [ ] Subscription tiers / monetization (Stripe)
- [ ] Mobile-responsive improvements
- [ ] Offline support / PWA
- [ ] Document attachments for persons (birth certs, letters — max 1MB, max 5 per person)
- [ ] Cloud storage adapter (swap local → R2/S3 via config)

---

## 9. Existing Documentation Index

These documents contain **detailed implementation plans** but may be partially outdated. Use this source-of-truth document for the actual current state.

| Document                                                                          | Location            | What It Covers                                                  | Status                                                                                      |
| --------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [MIGRATION_AND_DEPLOYMENT.md](../MIGRATION_AND_DEPLOYMENT.md)                     | Backend root        | SQLite → Postgres migration guide, deployment to Railway/Vercel | **Still relevant** — migration not started yet                                              |
| [AUTH_IMPLEMENTATION.md](AUTH_IMPLEMENTATION.md)                                  | Backend `.github/`  | Auth system design and implementation tasks                     | **Phases 1-4 completed**, Phase 5-6 partially done                                          |
| [SYSTEM_ADMIN_IMPLEMENTATION.md](SYSTEM_ADMIN_IMPLEMENTATION.md)                  | Backend `.github/`  | System admin feature design                                     | **Backend fully implemented**, frontend fully implemented                                   |
| [frontend_app.md](frontend_app.md)                                                | Backend `.github/`  | Frontend architecture documentation                             | **Outdated** — describes mock data phase, frontend has since been fully integrated with API |
| [COPILOT_INSTRUCTIONS.md](../../next-family-tree/.github/COPILOT_INSTRUCTIONS.md) | Frontend `.github/` | Frontend architecture for AI agents                             | **Outdated** — same as frontend_app.md, describes mock data era                             |
| [README.md](../../next-family-tree/.github/README.md)                             | Frontend `.github/` | Project overview, future backend specs                          | **Partially outdated** — backend specs differ from actual implementation                    |
| [next_steps.md](../../next-family-tree/.github/next_steps.md)                     | Frontend `.github/` | React Query setup, form improvements, progenitor management     | **Phases 1-2 completed**, Phases 3-5 mostly done                                            |
| [BUSINESS_LOGIC.md](../../next-family-tree/BUSINESS_LOGIC.md)                     | Frontend root       | Business model options, SaaS scaling plans                      | **Future planning document** — none implemented yet                                         |

---

## Quick Start (Development)

### Backend

```bash
cd nest-family-tree
npm install
# Set JWT_SECRET in .env (or it uses unsafe defaults)
npm run start:dev
# → http://localhost:3001
```

### Frontend

```bash
cd next-family-tree
npm install
# Set NEXT_PUBLIC_API_URL=http://localhost:3001 in .env.local
npm run dev
# → http://localhost:3000
```

### System Admin (first run)

Set these env vars in backend `.env`:

```env
JWT_SECRET=your-secret-key-change-in-production
SYSTEM_ADMIN_USERNAME=sysadmin
SYSTEM_ADMIN_PASSWORD=SecurePassword123!
SYSTEM_ADMIN_EMAIL=admin@example.com
```

System admin is auto-seeded on first startup.

---

_This document supersedes all other project documentation. When in doubt, trust this file._
