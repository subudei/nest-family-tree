# SQLite → PostgreSQL Migration & Deployment Guide

## Table of Contents

1. [Part 1: Migration Plan (SQLite → PostgreSQL)](#part-1-migration-plan)
2. [Part 2: Going Live (Deployment)](#part-2-going-live)

---

## Part 1: Migration Plan

### Current State

| Item                  | Current                                  |
| --------------------- | ---------------------------------------- |
| Database              | SQLite (`family-tree-db.sqlite` file)    |
| Driver                | `sqlite3` npm package                    |
| Schema management     | `synchronize: true` (auto-create tables) |
| Config                | Hardcoded in `app.module.ts`             |
| Environment variables | None                                     |

### Target State

| Item              | Target                                           |
| ----------------- | ------------------------------------------------ |
| Database          | PostgreSQL 16 (Docker for dev, managed for prod) |
| Driver            | `pg` npm package                                 |
| Schema management | TypeORM migrations                               |
| Config            | Environment variables via `.env`                 |

---

### Step 1: Docker Setup

#### 1.1 Install Docker (if not already)

Docker Desktop should already be installed. Verify:

```bash
docker --version
docker compose version
```

#### 1.2 Create `docker-compose.yml`

Create this file in the `nest-family-tree/` root:

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    container_name: family-tree-db
    restart: unless-stopped
    ports:
      - '5432:5432'
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: family_tree
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

**What this does:**

- Downloads and runs PostgreSQL 16 in a container
- Maps port 5432 (Postgres default) to your Mac's port 5432
- Creates a database called `family_tree`
- Username: `postgres`, Password: `postgres`
- `pgdata` volume = your data persists even if the container restarts

#### 1.3 Docker Commands You'll Use

```bash
# Start Postgres (run from nest-family-tree/ folder)
docker compose up -d

# Check it's running
docker compose ps

# Stop Postgres (data is preserved)
docker compose down

# Stop AND delete all data (fresh start)
docker compose down -v

# View Postgres logs
docker compose logs postgres
```

#### 1.4 Verify Connection (optional)

```bash
# Connect to the database from terminal
docker exec -it family-tree-db psql -U postgres -d family_tree

# Inside psql, type \dt to list tables (empty at first), \q to quit
```

---

### Step 2: Install Dependencies

```bash
cd nest-family-tree

# Add PostgreSQL driver
npm install pg

# Add config module (for reading .env files)
npm install @nestjs/config

# Remove SQLite driver
npm uninstall sqlite3
```

---

### Step 3: Create `.env` File

Create `nest-family-tree/.env`:

```env
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=family_tree

# JWT (move your existing secret here if you have one)
JWT_SECRET=your-jwt-secret-change-this

# Email (if using email service)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your-email@gmail.com
# SMTP_PASS=your-app-password
```

**Important:** Add `.env` to `.gitignore` so credentials don't get committed:

```gitignore
# .gitignore (add this line)
.env
```

Create a `.env.example` file (this one IS committed, as a template):

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=family_tree
JWT_SECRET=change-this-to-a-random-string
```

---

### Step 4: Update `app.module.ts`

Replace the current TypeORM configuration:

```typescript
// BEFORE (SQLite, hardcoded)
TypeOrmModule.forRoot({
  type: 'sqlite',
  database: 'family-tree-db.sqlite',
  entities: [Person, Partnership, Tree, SystemAdmin],
  synchronize: true,
})

// AFTER (PostgreSQL, from environment)
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DATABASE_HOST'),
        port: config.get<number>('DATABASE_PORT'),
        username: config.get('DATABASE_USERNAME'),
        password: config.get('DATABASE_PASSWORD'),
        database: config.get('DATABASE_NAME'),
        entities: [Person, Partnership, Tree, SystemAdmin],
        migrations: ['dist/migrations/*.js'],
        migrationsRun: true, // auto-run migrations on startup
      }),
    }),
    // ... rest of imports
  ],
})
```

**Key changes:**

- `ConfigModule.forRoot({ isGlobal: true })` — loads `.env` file, makes it available everywhere
- `TypeOrmModule.forRootAsync` — reads DB config from environment variables
- `synchronize: true` removed — replaced by `migrations` + `migrationsRun: true`

---

### Step 5: Fix Entity Types

SQLite had workarounds that we can now clean up for Postgres.

#### Person Entity

| Field       | SQLite (before) | PostgreSQL (after) | Notes                                                   |
| ----------- | --------------- | ------------------ | ------------------------------------------------------- |
| `gender`    | `varchar(10)`   | `enum`             | Proper DB-level validation                              |
| `birthDate` | `text`          | `varchar`          | Keep as string (flexible format like "1990", "1990-06") |
| `deathDate` | `text`          | `varchar`          | Same as above                                           |
| `trivia`    | `text`          | `text`             | No change needed                                        |

```typescript
// gender: remove the FIXME, use proper enum
@Column({ type: 'enum', enum: ['male', 'female'] })
gender: 'male' | 'female';

// dates: change from 'text' to 'varchar' (still stored as strings)
@Column({ type: 'varchar', nullable: true })
birthDate?: string;

@Column({ type: 'varchar', nullable: true })
deathDate?: string;
```

#### Partnership Entity

| Field           | SQLite (before) | PostgreSQL (after) |
| --------------- | --------------- | ------------------ |
| `marriageDate`  | `text`          | `varchar`          |
| `marriagePlace` | `text`          | `varchar`          |
| `divorceDate`   | `text`          | `varchar`          |
| `notes`         | `text`          | `text` (no change) |

#### SystemAdmin Entity

| Field         | SQLite (before) | PostgreSQL (after) |
| ------------- | --------------- | ------------------ |
| `lastLoginAt` | `datetime`      | `timestamp`        |

```typescript
@Column({ type: 'timestamp', nullable: true })
lastLoginAt?: Date;
```

> **Note on dates (birthDate, deathDate, marriageDate, divorceDate):**
> We keep these as `varchar` strings (not Postgres `date` type) because they store
> flexible formats: just a year ("1990"), year-month ("1990-06"), or full date ("1990-06-15").
> The Postgres `date` type requires a full date, which doesn't fit our use case.

---

### Step 6: Set Up TypeORM Migrations

#### 6.1 Add migration scripts to `package.json`

```json
{
  "scripts": {
    "typeorm": "ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js",
    "migration:generate": "npm run typeorm -- migration:generate -d src/data-source.ts",
    "migration:create": "npm run typeorm -- migration:create",
    "migration:run": "npm run typeorm -- migration:run -d src/data-source.ts",
    "migration:revert": "npm run typeorm -- migration:revert -d src/data-source.ts"
  }
}
```

#### 6.2 Create a data-source file for the CLI

Create `src/data-source.ts`:

```typescript
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { Person } from './persons/person.entity';
import { Partnership } from './persons/partnership.entity';
import { Tree } from './trees/tree.entity';
import { SystemAdmin } from './system-admin/entities/system-admin.entity';

config(); // load .env

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  entities: [Person, Partnership, Tree, SystemAdmin],
  migrations: ['src/migrations/*.ts'],
});
```

#### 6.3 Generate the initial migration

```bash
# Make sure Docker Postgres is running
docker compose up -d

# Generate migration from your entities
npm run migration:generate -- src/migrations/InitialSchema

# This creates a file like: src/migrations/1234567890-InitialSchema.ts
# It contains all the CREATE TABLE statements

# Run the migration
npm run migration:run
```

#### 6.4 Future workflow

Whenever you change an entity:

```bash
# 1. Edit your entity file
# 2. Generate a migration for the changes
npm run migration:generate -- src/migrations/DescriptiveNameHere

# 3. Review the generated migration file
# 4. Run it
npm run migration:run
```

---

### Step 7: Data Migration (Optional)

If you have data in your SQLite database that you want to keep:

```bash
# Export from SQLite to SQL
sqlite3 family-tree-db.sqlite .dump > sqlite_dump.sql

# You'll need to manually convert SQLite SQL to PostgreSQL SQL
# Main differences:
# - AUTOINCREMENT → SERIAL / GENERATED ALWAYS AS IDENTITY
# - "datetime" → timestamp
# - Boolean 0/1 → true/false
# - Text quoting differences
```

For a small dataset, it may be easier to just re-enter the data through the UI after migration.

---

### Step 8: Test Everything

```bash
# 1. Start Docker Postgres
docker compose up -d

# 2. Run migrations
npm run migration:run

# 3. Start the backend
npm run dev

# 4. Test in the frontend — create a tree, add persons, etc.
```

---

### Migration Checklist

- [ ] Docker Desktop running
- [ ] `docker-compose.yml` created
- [ ] `docker compose up -d` — Postgres running
- [ ] `npm install pg @nestjs/config` and `npm uninstall sqlite3`
- [ ] `.env` file created with DB credentials
- [ ] `.env` added to `.gitignore`
- [ ] `app.module.ts` updated (ConfigModule + Postgres config)
- [ ] Entity types fixed (enum, varchar, timestamp)
- [ ] `data-source.ts` created
- [ ] Migration scripts added to `package.json`
- [ ] Initial migration generated and run
- [ ] Backend starts without errors
- [ ] Frontend works end-to-end

---

## Part 2: Going Live

### What You Need

To put your app on the internet, you need **3 things running in the cloud**:

```
┌─────────────────────────────────────────────────────┐
│                    THE INTERNET                      │
│                                                      │
│   Users visit: https://my-family-tree.com            │
│         │                                            │
│         ▼                                            │
│   ┌─────────────┐                                    │
│   │  FRONTEND   │  ← Next.js app (Vercel)            │
│   │  (Next.js)  │     https://my-family-tree.com     │
│   └──────┬──────┘                                    │
│          │ API calls                                 │
│          ▼                                            │
│   ┌─────────────┐                                    │
│   │  BACKEND    │  ← NestJS app (Railway/Render)     │
│   │  (NestJS)   │     https://api.my-family-tree.com │
│   └──────┬──────┘                                    │
│          │ SQL queries                               │
│          ▼                                            │
│   ┌─────────────┐                                    │
│   │  DATABASE   │  ← PostgreSQL (Railway/Neon)       │
│   │  (Postgres) │     (internal connection string)   │
│   └─────────────┘                                    │
└─────────────────────────────────────────────────────┘
```

### The 3 Services

#### 1. Frontend Hosting (Next.js)

**What it does:** Serves your React/Next.js pages to users' browsers.

**Best option: Vercel** (made by the creators of Next.js)

|                    | Details                                    |
| ------------------ | ------------------------------------------ |
| URL                | https://vercel.com                         |
| Cost               | Free (hobby tier), $20/mo (pro)            |
| What they give you | A URL like `my-family-tree.vercel.app`     |
| Custom domain      | You can connect `my-family-tree.com`       |
| Deploy process     | Connect GitHub repo → auto-deploys on push |

**Setup:**

1. Push `next-family-tree` to GitHub
2. Sign up at vercel.com with your GitHub account
3. Click "Import Project" → select your repo
4. Set environment variable: `NEXT_PUBLIC_API_URL=https://your-backend-url.com`
5. Deploy — done

#### 2. Backend Hosting (NestJS)

**What it does:** Runs your NestJS API server in the cloud.

**Best option: Railway**

|                    | Details                                                 |
| ------------------ | ------------------------------------------------------- |
| URL                | https://railway.app                                     |
| Cost               | $5/mo (hobby), usage-based                              |
| What they give you | A URL like `nest-family-tree-production.up.railway.app` |
| Custom domain      | You can connect `api.my-family-tree.com`                |
| Deploy process     | Connect GitHub repo → auto-deploys on push              |

**Alternatives:**

- **Render** (https://render.com) — free tier available, slower cold starts
- **Fly.io** (https://fly.io) — cheap, more technical setup
- **DigitalOcean App Platform** — $5/mo, straightforward

**Setup:**

1. Push `nest-family-tree` to GitHub
2. Sign up at railway.app
3. Click "New Project" → "Deploy from GitHub repo"
4. Set environment variables in Railway dashboard:
   ```
   DATABASE_HOST=<provided by Railway Postgres>
   DATABASE_PORT=5432
   DATABASE_USERNAME=postgres
   DATABASE_PASSWORD=<auto-generated>
   DATABASE_NAME=railway
   JWT_SECRET=<your-production-secret>
   ```
5. Deploy

#### 3. Database (PostgreSQL)

**What it does:** Stores all your family tree data in the cloud.

**Option A: Railway Postgres** (recommended — same platform as backend)

|            | Details                                                      |
| ---------- | ------------------------------------------------------------ |
| Cost       | Included in Railway $5/mo                                    |
| Setup      | Click "Add Service" → "Database" → "PostgreSQL" in Railway   |
| Connection | Railway gives you the DATABASE_URL, which you set as env var |
| Backups    | Automatic                                                    |

**Option B: Neon** (if you host backend elsewhere)

|         | Details                                           |
| ------- | ------------------------------------------------- |
| URL     | https://neon.tech                                 |
| Cost    | Free (0.5GB), $19/mo (pro)                        |
| Setup   | Sign up → create project → copy connection string |
| Feature | Serverless — scales to zero when not in use       |

**Option C: Supabase**

|       | Details                                           |
| ----- | ------------------------------------------------- |
| URL   | https://supabase.com                              |
| Cost  | Free (500MB), $25/mo (pro)                        |
| Setup | Sign up → create project → copy connection string |
| Bonus | Includes a web UI to view/edit your data          |

---

### URLs Explained

When your app is live, you'll have these URLs:

```
FRONTEND (what users see):
  https://my-family-tree.vercel.app    ← free Vercel URL
  https://my-family-tree.com           ← custom domain (optional, ~$12/year)

BACKEND (API, called by frontend):
  https://nest-family-tree.up.railway.app    ← free Railway URL
  https://api.my-family-tree.com             ← custom domain (optional)

DATABASE (internal, not publicly accessible):
  postgresql://postgres:abc123@containers-us-west-123.railway.app:5432/railway
  ↑ Only your backend connects to this. Users never see this URL.
```

### Custom Domain (Optional)

If you want `my-family-tree.com` instead of `*.vercel.app`:

1. **Buy a domain** (~$12/year):
   - https://namecheap.com
   - https://cloudflare.com/products/registrar (cheapest)
   - https://domains.google.com

2. **Point it to your hosting:**
   - `my-family-tree.com` → Vercel (frontend)
   - `api.my-family-tree.com` → Railway (backend)
   - Both hosting platforms have guides to set up DNS records

---

### Recommended Stack (Simplest & Cheapest)

| Layer     | Service                         | Monthly Cost      |
| --------- | ------------------------------- | ----------------- |
| Frontend  | **Vercel** (free tier)          | $0                |
| Backend   | **Railway** (hobby)             | ~$5               |
| Database  | **Railway Postgres** (included) | $0 (included)     |
| Domain    | Optional (Cloudflare)           | ~$1/mo ($12/year) |
| **Total** |                                 | **~$5-6/month**   |

### Alternative: All-Free Stack

| Layer     | Service               | Monthly Cost          |
| --------- | --------------------- | --------------------- |
| Frontend  | **Vercel** (free)     | $0                    |
| Backend   | **Render** (free)     | $0 (slow cold starts) |
| Database  | **Neon** (free 0.5GB) | $0                    |
| **Total** |                       | **$0**                |

> ⚠️ Free tier downsides: Backend "sleeps" after inactivity (15-30 second cold starts),
> database has storage limits. Fine for personal/family use, not ideal if many users.

---

### Step-by-Step Deployment Walkthrough

#### Phase 1: Prepare the Code

1. **Frontend:** Make sure the API URL is configurable:

   ```typescript
   // next-family-tree/src/api/auth.ts (and other API files)
   const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
   ```

2. **Backend:** Make sure CORS allows your frontend domain:

   ```typescript
   // nest-family-tree/src/main.ts
   app.enableCors({
     origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
   });
   ```

3. **Push both repos to GitHub**

#### Phase 2: Deploy Database + Backend (Railway)

1. Go to https://railway.app → Sign up with GitHub
2. Create a new project
3. Add a **PostgreSQL** database service
4. Add your **backend** repo (Deploy from GitHub)
5. Railway auto-detects NestJS and builds it
6. Set environment variables (Railway provides DB credentials automatically if you link the services)
7. Your backend gets a URL like `https://nest-family-tree-production.up.railway.app`

#### Phase 3: Deploy Frontend (Vercel)

1. Go to https://vercel.com → Sign up with GitHub
2. Import `next-family-tree` repo
3. Add environment variable:
   ```
   NEXT_PUBLIC_API_URL=https://nest-family-tree-production.up.railway.app
   ```
4. Deploy → You get a URL like `https://next-family-tree.vercel.app`

#### Phase 4: Verify

1. Open your Vercel URL in a browser
2. Create a tree, log in, add persons
3. Everything should work with the cloud database

#### Phase 5: Custom Domain (Optional)

1. Buy domain at Cloudflare or Namecheap
2. In Vercel: Settings → Domains → Add `my-family-tree.com`
3. In Railway: Settings → Domains → Add `api.my-family-tree.com`
4. Add DNS records as instructed by each platform
5. Update `NEXT_PUBLIC_API_URL` in Vercel to `https://api.my-family-tree.com`

---

### Environment Variables Summary

#### Backend (Railway dashboard)

```
DATABASE_HOST=<from Railway Postgres>
DATABASE_PORT=5432
DATABASE_USERNAME=<from Railway Postgres>
DATABASE_PASSWORD=<from Railway Postgres>
DATABASE_NAME=<from Railway Postgres>
JWT_SECRET=<generate a random 64-char string>
CORS_ORIGIN=https://next-family-tree.vercel.app
```

#### Frontend (Vercel dashboard)

```
NEXT_PUBLIC_API_URL=https://nest-family-tree-production.up.railway.app
```

---

### Security Checklist Before Going Live

- [ ] JWT_SECRET is a strong random string (not "your-jwt-secret-change-this")
- [ ] Database password is strong (Railway auto-generates one)
- [ ] `.env` file is in `.gitignore` (credentials not in GitHub)
- [ ] CORS is restricted to your frontend domain only
- [ ] `synchronize: true` is NOT used in production (use migrations)
- [ ] Admin default passwords are changed

---

### Architecture Summary

```
DEVELOPMENT (your Mac):
  Frontend  →  http://localhost:3001  (next dev)
  Backend   →  http://localhost:3000  (nest start --watch)
  Database  →  localhost:5432         (Docker Postgres)

PRODUCTION (cloud):
  Frontend  →  https://my-family-tree.vercel.app    (Vercel)
  Backend   →  https://api.my-family-tree.com       (Railway)
  Database  →  postgresql://...railway.app:5432      (Railway Postgres)

Same code. Different env vars. That's it.
```
