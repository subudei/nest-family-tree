# System Admin Implementation Plan

## Final Goal

Build a System Admin feature that allows designated administrators to:

- View and manage all family trees in the system
- Edit/delete any tree's data for support purposes
- Export tree data for backups
- Monitor system usage and statistics

---

## User Stories

### System Admin

> "As a System Admin, I want to log in to a dashboard where I can see all family trees, help users with data issues, and export backups when needed."

### Multiple System Admins

> "As the owner, I want to add other trusted people as System Admins so they can help manage the platform."

---

## Data Model

```
┌─────────────────────────────────────┐
│          system_admins              │
├─────────────────────────────────────┤
│ id: UUID (PK)                       │
│ username: string (UNIQUE)           │
│ passwordHash: string                │
│ email: string (nullable)            │
│ displayName: string                 │
│ isActive: boolean (default: true)   │
│ createdAt: timestamp                │
│ updatedAt: timestamp                │
│ lastLoginAt: timestamp (nullable)   │
└─────────────────────────────────────┘
```

**Notes:**

- First System Admin is seeded from environment variables on startup
- Additional admins can be created via the dashboard
- `isActive` allows disabling without deleting

---

## API Endpoints

### Authentication

| Method | Endpoint              | Description            | Auth Required |
| ------ | --------------------- | ---------------------- | ------------- |
| POST   | `/system-admin/login` | System Admin login     | No            |
| GET    | `/system-admin/me`    | Get current admin info | SystemAdmin   |

### Dashboard & Stats

| Method | Endpoint                  | Description    | Auth Required |
| ------ | ------------------------- | -------------- | ------------- |
| GET    | `/system-admin/dashboard` | Overview stats | SystemAdmin   |

### Tree Management

| Method | Endpoint                         | Description                 | Auth Required |
| ------ | -------------------------------- | --------------------------- | ------------- |
| GET    | `/system-admin/trees`            | List all trees (paginated)  | SystemAdmin   |
| GET    | `/system-admin/trees/:id`        | Get tree details with stats | SystemAdmin   |
| DELETE | `/system-admin/trees/:id`        | Delete entire tree          | SystemAdmin   |
| GET    | `/system-admin/trees/:id/export` | Export tree as JSON         | SystemAdmin   |

### Person Management (within any tree)

| Method | Endpoint                                  | Description        | Auth Required |
| ------ | ----------------------------------------- | ------------------ | ------------- |
| GET    | `/system-admin/trees/:treeId/persons`     | Get all persons    | SystemAdmin   |
| GET    | `/system-admin/trees/:treeId/persons/:id` | Get person details | SystemAdmin   |
| PATCH  | `/system-admin/trees/:treeId/persons/:id` | Update person      | SystemAdmin   |
| DELETE | `/system-admin/trees/:treeId/persons/:id` | Delete person      | SystemAdmin   |

### Admin Management (manage other system admins)

| Method | Endpoint                   | Description             | Auth Required |
| ------ | -------------------------- | ----------------------- | ------------- |
| GET    | `/system-admin/admins`     | List all system admins  | SystemAdmin   |
| POST   | `/system-admin/admins`     | Create new system admin | SystemAdmin   |
| PATCH  | `/system-admin/admins/:id` | Update system admin     | SystemAdmin   |
| DELETE | `/system-admin/admins/:id` | Deactivate system admin | SystemAdmin   |

---

## Implementation Tasks

### Phase 1: Backend - Database & Entity

- [ ] **1.1** Create `SystemAdmin` entity
  - `src/system-admin/entities/system-admin.entity.ts`
  - Fields: id, username, passwordHash, email, displayName, isActive, timestamps

- [ ] **1.2** Create `SystemAdminModule`
  - `src/system-admin/system-admin.module.ts`
  - Import TypeORM, JWT modules

- [ ] **1.3** Create `SystemAdminService`
  - `src/system-admin/system-admin.service.ts`
  - CRUD operations for system admins
  - Seed from env on module init

- [ ] **1.4** Add environment variables

  ```env
  SYSTEM_ADMIN_USERNAME=sysadmin
  SYSTEM_ADMIN_PASSWORD=SecurePassword123
  SYSTEM_ADMIN_EMAIL=admin@example.com
  ```

- [ ] **1.5** Implement seeding logic
  - On app startup, check if seeded admin exists
  - If not, create from env variables
  - Skip if already exists (don't override)

---

### Phase 2: Backend - Authentication

- [ ] **2.1** Create DTOs
  - `src/system-admin/dtos/login.dto.ts`
  - `src/system-admin/dtos/create-admin.dto.ts`
  - `src/system-admin/dtos/update-admin.dto.ts`

- [ ] **2.2** Create `SystemAdminGuard`
  - `src/system-admin/guards/system-admin.guard.ts`
  - Check `role === 'systemadmin'` in JWT

- [ ] **2.3** Create `SystemAdminController` - Auth routes
  - `src/system-admin/system-admin.controller.ts`
  - POST `/system-admin/login`
  - GET `/system-admin/me`

- [ ] **2.4** Update JWT payload types
  - Add `'systemadmin'` to role union type
  - SystemAdmin JWT has no `treeId` (can access all)

---

### Phase 3: Backend - Management Endpoints

- [ ] **3.1** Dashboard endpoint
  - GET `/system-admin/dashboard`
  - Returns: totalTrees, totalPersons, totalUsers, recentTrees

- [ ] **3.2** Trees management endpoints
  - GET `/system-admin/trees` - List with pagination, search
  - GET `/system-admin/trees/:id` - Details with person count
  - DELETE `/system-admin/trees/:id` - Cascade delete tree + persons
  - GET `/system-admin/trees/:id/export` - JSON export

- [ ] **3.3** Persons management endpoints
  - GET `/system-admin/trees/:treeId/persons` - List all
  - PATCH `/system-admin/trees/:treeId/persons/:id` - Edit
  - DELETE `/system-admin/trees/:treeId/persons/:id` - Delete

- [ ] **3.4** Admin management endpoints
  - GET `/system-admin/admins` - List all system admins
  - POST `/system-admin/admins` - Create new admin
  - PATCH `/system-admin/admins/:id` - Update (can't edit own role)
  - DELETE `/system-admin/admins/:id` - Soft delete (isActive = false)

---

### Phase 4: Frontend - System Admin Layout

- [ ] **4.1** Create System Admin types
  - `src/types/system-admin.ts`

- [ ] **4.2** Create System Admin API functions
  - `src/api/system-admin.ts`

- [ ] **4.3** Create System Admin Auth Context
  - `src/context/SystemAdminContext.tsx`
  - Separate from regular AuthContext
  - Different localStorage key

- [ ] **4.4** Create System Admin layout
  - `app/system-admin/layout.tsx`
  - Sidebar navigation
  - Different styling (darker theme?)

---

### Phase 5: Frontend - Login & Dashboard

- [ ] **5.1** Create login page
  - `app/system-admin/login/page.tsx`
  - Simple login form
  - Redirect to dashboard on success

- [ ] **5.2** Create dashboard page
  - `app/system-admin/dashboard/page.tsx`
  - Stats cards: Total Trees, Total Persons, Recent Activity
  - Quick links to common actions

---

### Phase 6: Frontend - Tree Management

- [ ] **6.1** Create trees list page
  - `app/system-admin/trees/page.tsx`
  - Table with: name, admin username, person count, created date
  - Search/filter functionality
  - Pagination

- [ ] **6.2** Create tree detail page
  - `app/system-admin/trees/[id]/page.tsx`
  - Tree info header
  - Persons list (same as regular tree view)
  - Export button
  - Delete button (with confirmation)

- [ ] **6.3** Implement export functionality
  - Download as JSON file
  - Include all persons with relationships

---

### Phase 7: Frontend - Admin Management

- [ ] **7.1** Create admins list page
  - `app/system-admin/admins/page.tsx`
  - Table with: username, email, status, last login
  - Add new admin button

- [ ] **7.2** Create/edit admin modal
  - Username, password, email, displayName
  - Validation

- [ ] **7.3** Deactivate/reactivate functionality
  - Soft delete (mark inactive)
  - Can't deactivate yourself

---

### Phase 8: Testing & Polish

- [ ] **8.1** Test system admin login
- [ ] **8.2** Test dashboard stats accuracy
- [ ] **8.3** Test tree browsing and editing
- [ ] **8.4** Test export functionality
- [ ] **8.5** Test admin management
- [ ] **8.6** Add loading states
- [ ] **8.7** Add error handling
- [ ] **8.8** Audit logging (optional)

---

## File Structure

```
nest-family-tree/
├── src/
│   └── system-admin/                       [NEW]
│       ├── system-admin.module.ts
│       ├── system-admin.controller.ts
│       ├── system-admin.service.ts
│       ├── entities/
│       │   └── system-admin.entity.ts
│       ├── dtos/
│       │   ├── login.dto.ts
│       │   ├── create-admin.dto.ts
│       │   └── update-admin.dto.ts
│       └── guards/
│           └── system-admin.guard.ts

next-family-tree/
├── app/
│   └── system-admin/                       [NEW]
│       ├── layout.tsx
│       ├── login/
│       │   └── page.tsx
│       ├── dashboard/
│       │   └── page.tsx
│       ├── trees/
│       │   ├── page.tsx
│       │   └── [id]/
│       │       └── page.tsx
│       └── admins/
│           └── page.tsx
├── src/
│   ├── api/
│   │   └── system-admin.ts                 [NEW]
│   ├── context/
│   │   └── SystemAdminContext.tsx          [NEW]
│   └── types/
│       └── system-admin.ts                 [NEW]
```

---

## JWT Payload Structure

### Regular User (Admin/Guest)

```typescript
{
  sub: "tree-uuid",      // treeId
  role: "admin" | "guest",
  treeName: "Family Name"
}
```

### System Admin

```typescript
{
  sub: "system-admin-uuid",  // adminId
  role: "systemadmin",
  displayName: "John Doe"
  // No treeId - can access all trees
}
```

---

## Environment Variables

```env
# Add to .env
SYSTEM_ADMIN_USERNAME=sysadmin
SYSTEM_ADMIN_PASSWORD=SecurePassword123!
SYSTEM_ADMIN_EMAIL=admin@familytree.com
SYSTEM_ADMIN_DISPLAY_NAME=System Administrator
```

---

## Security Considerations

- System Admin uses same JWT secret but different role
- System Admin endpoints are completely separate from regular endpoints
- Cannot access system admin routes with regular admin JWT
- Audit log for sensitive operations (future enhancement)
- Rate limiting on login endpoint
- Strong password requirements for system admins

---

## Dashboard Stats (Example Response)

```json
{
  "stats": {
    "totalTrees": 42,
    "totalPersons": 1523,
    "treesThisMonth": 5,
    "personsThisMonth": 87
  },
  "recentTrees": [
    {
      "id": "uuid",
      "name": "Smith Family",
      "adminUsername": "smithadmin",
      "personCount": 45,
      "createdAt": "2026-01-15T10:30:00Z"
    }
  ]
}
```

---

## Export Format (Example)

```json
{
  "exportedAt": "2026-01-31T12:00:00Z",
  "exportedBy": "sysadmin",
  "tree": {
    "id": "uuid",
    "name": "Nemanjici",
    "adminUsername": "nemanjici_admin",
    "createdAt": "2026-01-30T..."
  },
  "persons": [
    {
      "id": 1,
      "firstName": "Zavida",
      "lastName": "Vukanovic",
      "gender": "male",
      "birthDate": "1102-01-01",
      "deathDate": "1167-12-31",
      "progenitor": true,
      "fatherId": null,
      "motherId": null
    }
  ],
  "personCount": 1
}
```

---

## Success Criteria

1. [ ] System Admin can log in via separate login page
2. [ ] Dashboard shows accurate statistics
3. [ ] Can browse all trees in the system
4. [ ] Can view any tree's persons
5. [ ] Can edit/delete persons in any tree
6. [ ] Can delete entire trees
7. [ ] Can export tree data as JSON
8. [ ] Can manage other System Admins
9. [ ] First admin is auto-seeded from env
10. [ ] Regular users cannot access system admin routes

---

## Future Enhancements

- [ ] Audit logging (who did what, when)
- [ ] Bulk operations (delete multiple trees)
- [ ] Import tree from JSON backup
- [ ] Email notifications for important actions
- [ ] Two-factor authentication for system admins
- [ ] Activity dashboard with graphs
- [ ] User impersonation (login as tree admin for support)
