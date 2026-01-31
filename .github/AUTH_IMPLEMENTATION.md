# Authentication Implementation Plan

## Final Goal

Build a self-managed authentication system where:

- Users can create their own family tree with admin credentials
- Admins can share read-only access via guest credentials
- Login is simple: just username + password (no tree ID needed)
- Each tree is isolated - users only see their own tree's data

---

## User Stories

### Admin User (Tree Owner)

> "As Mike, I want to create my family tree, set my admin login, and create guest credentials to share with my relatives so they can view the tree."

### Guest User (Viewer)

> "As Mike's relative, I want to log in with the guest credentials Mike gave me and view the family tree (read-only)."

---

## Data Model

```
┌─────────────────────────────────────┐
│              trees                   │
├─────────────────────────────────────┤
│ id: UUID (PK)                       │
│ name: string                        │  "Mike's Family Tree"
│ adminUsername: string (UNIQUE)      │  "MikeTheGreat"
│ adminPasswordHash: string           │
│ guestUsername: string (UNIQUE)      │  "MikesGuest"
│ guestPasswordHash: string           │
│ ownerEmail: string (nullable)       │  For password recovery
│ createdAt: timestamp                │
│ updatedAt: timestamp                │
└─────────────────────────────────────┘
            │
            │ 1:many
            ▼
┌─────────────────────────────────────┐
│             persons                  │
├─────────────────────────────────────┤
│ id: UUID (PK)                       │
│ treeId: UUID (FK → trees.id)  [NEW] │
│ firstName, lastName, etc...         │
└─────────────────────────────────────┘
```

---

## API Endpoints

### Auth Endpoints (New)

| Method | Endpoint                  | Description                     | Auth Required |
| ------ | ------------------------- | ------------------------------- | ------------- |
| POST   | `/auth/register`          | Create new tree + admin account | No            |
| POST   | `/auth/login`             | Login (admin or guest)          | No            |
| GET    | `/auth/me`                | Get current user info           | Yes           |
| PATCH  | `/auth/guest-credentials` | Update guest username/password  | Admin only    |

### Persons Endpoints (Updated)

All existing endpoints now require authentication and are scoped to the user's tree:

| Method | Endpoint       | Admin | Guest          |
| ------ | -------------- | ----- | -------------- |
| GET    | `/persons`     | ✅    | ✅ (read-only) |
| GET    | `/persons/:id` | ✅    | ✅ (read-only) |
| POST   | `/persons`     | ✅    | ❌             |
| PATCH  | `/persons/:id` | ✅    | ❌             |
| DELETE | `/persons/:id` | ✅    | ❌             |

---

## Implementation Tasks

### Phase 1: Backend - Database Setup ✅ COMPLETED

- [x] **1.1** Install required packages

  ```bash
  npm install @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt
  npm install -D @types/passport-jwt @types/bcrypt
  ```

- [x] **1.2** Create `Tree` entity (`src/trees/tree.entity.ts`)
  - id (UUID, auto-generated)
  - name (string)
  - adminUsername (string, unique)
  - adminPasswordHash (string)
  - guestUsername (string, unique)
  - guestPasswordHash (string)
  - ownerEmail (string, nullable)
  - createdAt, updatedAt

- [x] **1.3** Create `TreesModule` with basic service
  - `src/trees/trees.module.ts`
  - `src/trees/trees.service.ts`

- [x] **1.4** Update `Person` entity
  - Add `treeId` column (UUID, foreign key)
  - Add relation to Tree entity

- [x] **1.5** Run database migration / sync
  - Note: Old database was deleted to allow fresh schema sync

---

### Phase 2: Backend - Auth Module

- [ ] **2.1** Create Auth module structure
  - `src/auth/auth.module.ts`
  - `src/auth/auth.service.ts`
  - `src/auth/auth.controller.ts`

- [ ] **2.2** Create DTOs
  - `src/auth/dtos/register.dto.ts`
  - `src/auth/dtos/login.dto.ts`

- [ ] **2.3** Implement JWT Strategy
  - `src/auth/strategies/jwt.strategy.ts`
  - Configure JWT module with 24h expiration

- [ ] **2.4** Implement Auth Service
  - `register()` - create tree with hashed passwords
  - `login()` - verify credentials, return JWT
  - `validateUser()` - check username in both admin/guest columns

- [ ] **2.5** Implement Auth Controller
  - POST `/auth/register`
  - POST `/auth/login`
  - GET `/auth/me`

- [ ] **2.6** Create Guards
  - `src/auth/guards/jwt-auth.guard.ts` - requires valid JWT
  - `src/auth/guards/admin.guard.ts` - requires admin role

---

### Phase 3: Backend - Update Persons Module

- [ ] **3.1** Update PersonsService
  - All methods now receive `treeId` from JWT
  - `findAll(treeId)` - filter by tree
  - `create(treeId, dto)` - attach treeId
  - Ensure person belongs to tree before update/delete

- [ ] **3.2** Update PersonsController
  - Apply `JwtAuthGuard` to all routes
  - Apply `AdminGuard` to POST, PATCH, DELETE
  - Extract `treeId` from JWT payload

- [ ] **3.3** Update DTOs if needed

---

### Phase 4: Frontend - Auth Infrastructure

- [ ] **4.1** Install packages (if needed)

  ```bash
  npm install js-cookie
  npm install -D @types/js-cookie
  ```

- [ ] **4.2** Create Auth types
  - `src/types/auth.ts`

- [ ] **4.3** Create Auth API functions
  - `src/api/auth.ts`
  - `register()`, `login()`, `getMe()`

- [ ] **4.4** Create Auth Context/Provider
  - `src/context/AuthContext.tsx`
  - Store: token, user, role, treeId, isAuthenticated
  - Methods: login, logout, register

- [ ] **4.5** Create Auth hook
  - `src/hooks/useAuth.ts`

- [ ] **4.6** Update API client
  - Add Authorization header to all requests
  - Handle 401 responses (redirect to login)

---

### Phase 5: Frontend - Pages & Components

- [ ] **5.1** Create Home page (update `app/page.tsx`)
  - Welcome message
  - Login form
  - "Create New Tree" button

- [ ] **5.2** Create Signup page
  - `app/signup/page.tsx`
  - Tree creation form with all fields
  - Validation for unique usernames

- [ ] **5.3** Create Login component
  - `src/components/LoginForm.tsx`
  - Username + password fields
  - Error handling

- [ ] **5.4** Update Tree page (`app/tree/page.tsx`)
  - Require authentication
  - Redirect to login if not authenticated
  - Remove treeId from URL (get from JWT)

- [ ] **5.5** Update existing components
  - Hide edit/delete buttons for guests
  - Show "View Only" badge for guests
  - Add logout button

---

### Phase 6: Testing & Polish

- [ ] **6.1** Test registration flow
- [ ] **6.2** Test admin login + CRUD operations
- [ ] **6.3** Test guest login + read-only access
- [ ] **6.4** Test invalid credentials handling
- [ ] **6.5** Test token expiration
- [ ] **6.6** Add loading states
- [ ] **6.7** Add error messages

---

## File Structure (New/Modified Files)

```
nest-family-tree/
├── src/
│   ├── auth/                          [NEW]
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── dtos/
│   │   │   ├── register.dto.ts
│   │   │   └── login.dto.ts
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts
│   │   │   └── admin.guard.ts
│   │   └── strategies/
│   │       └── jwt.strategy.ts
│   ├── trees/                         [NEW]
│   │   ├── trees.module.ts
│   │   ├── trees.service.ts
│   │   └── tree.entity.ts
│   ├── persons/
│   │   ├── person.entity.ts           [MODIFIED - add treeId]
│   │   ├── persons.service.ts         [MODIFIED - filter by tree]
│   │   └── persons.controller.ts      [MODIFIED - add guards]
│   └── app.module.ts                  [MODIFIED - import new modules]

next-family-tree/
├── app/
│   ├── page.tsx                       [MODIFIED - login/welcome]
│   ├── signup/
│   │   └── page.tsx                   [NEW]
│   └── tree/
│       └── page.tsx                   [MODIFIED - require auth]
├── src/
│   ├── api/
│   │   ├── auth.ts                    [NEW]
│   │   └── persons.ts                 [MODIFIED - add auth header]
│   ├── context/
│   │   └── AuthContext.tsx            [NEW]
│   ├── hooks/
│   │   └── useAuth.ts                 [NEW]
│   ├── types/
│   │   └── auth.ts                    [NEW]
│   └── components/
│       ├── LoginForm.tsx              [NEW]
│       ├── SignupForm.tsx             [NEW]
│       └── ... existing components    [MODIFIED - role checks]
```

---

## JWT Payload Structure

```typescript
interface JwtPayload {
  sub: string; // treeId
  role: 'admin' | 'guest';
  treeName: string;
  iat: number; // issued at
  exp: number; // expires (24h)
}
```

---

## Validation Rules

### Registration

- Tree name: 2-100 characters
- Admin username: 3-30 characters, alphanumeric + underscore
- Admin password: 8+ characters, at least 1 uppercase, 1 lowercase, 1 number
- Guest username: 3-30 characters, alphanumeric + underscore
- Guest password: 6+ characters
- Email: valid email format (optional)

### Uniqueness

- Admin username must be unique across ALL trees
- Guest username must be unique across ALL trees
- Error message: "Username already taken"

---

## Security Considerations

- Passwords hashed with bcrypt (10 rounds)
- JWT secret stored in environment variable
- HTTPS in production
- Rate limiting on login endpoint (future)
- Password reset via email (future)

---

## Environment Variables (Backend)

```env
# Add to .env
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRATION=24h
```

---

## Success Criteria

1. ✅ User can create a new tree with admin + guest credentials
2. ✅ Admin can log in and perform all CRUD operations
3. ✅ Guest can log in and view tree (read-only)
4. ✅ Invalid credentials show error message
5. ✅ Users only see their own tree's data
6. ✅ Token expires after 24 hours
7. ✅ Guests cannot access create/edit/delete operations

---

## Next Steps (After Auth is Complete)

- [ ] Admin can update guest credentials
- [ ] Password reset via email
- [ ] Trial version (15 person limit)
- [ ] Paid version (unlimited)
- [ ] Multiple trees per person (different admin usernames)
