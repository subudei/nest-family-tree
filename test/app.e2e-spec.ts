import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PersonsModule } from '../src/persons/persons.module';
import { TreesModule } from '../src/trees/trees.module';
import { AuthModule } from '../src/auth/auth.module';
import { UsersModule } from '../src/users/users.module';
import { EmailModule } from '../src/email/email.module';
import { SystemAdminModule } from '../src/system-admin/system-admin.module';
import { Person } from '../src/persons/person.entity';
import { Partnership } from '../src/persons/partnership.entity';
import { Tree } from '../src/trees/tree.entity';
import { User } from '../src/users/user.entity';
import { SystemAdmin } from '../src/system-admin/entities/system-admin.entity';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';

// ─── Test Setup ─────────────────────────────────────────────────────────────

/**
 * Full E2E tests for the Family Tree API.
 * Uses an in-memory SQLite database so tests are isolated from dev data.
 */
describe('Family Tree API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Set env vars for system admin seeding
    // NOTE: Do NOT set JWT_SECRET here — JwtModule.register() in AuthModule/SystemAdminModule
    // is evaluated at import time (before beforeAll), so setting it here causes a
    // signing/verification mismatch. Both JwtModule and JwtStrategy use the same
    // fallback secret when JWT_SECRET is unset, which is what we want.
    process.env.SYSTEM_ADMIN_USERNAME = 'sysadmin';
    process.env.SYSTEM_ADMIN_PASSWORD = 'AdminPass123!';
    process.env.SYSTEM_ADMIN_EMAIL = 'admin@test.com';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Person, Partnership, Tree, User, SystemAdmin],
          synchronize: true,
          dropSchema: true,
        }),
        EmailModule,
        PersonsModule,
        TreesModule,
        AuthModule,
        UsersModule,
        SystemAdminModule,
      ],
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // Shared state across test groups (populated during auth flow)
  let ownerToken: string;
  let guestToken: string;
  let treeId: string;
  let userId: string;
  let guestUsername: string;

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. AUTH FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Auth Flow', () => {
    it('POST /auth/register — should create owner + tree', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'owner@test.com',
          password: 'TestPass1',
          treeName: 'Doe Family',
          guestUsername: 'doe_guest',
          guestPassword: 'Guest123',
        })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.type).toBe('owner');
      expect(res.body.trees).toHaveLength(1);
      expect(res.body.trees[0].name).toBe('Doe Family');
      expect(res.body.trees[0].guestUsername).toBe('doe_guest');

      ownerToken = res.body.accessToken;
      userId = res.body.userId;
      treeId = res.body.trees[0].id;
      guestUsername = res.body.trees[0].guestUsername;
    });

    it('POST /auth/register — should reject duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'owner@test.com',
          password: 'TestPass1',
          treeName: 'Another Tree',
          guestUsername: 'another_guest',
          guestPassword: 'Guest123',
        })
        .expect(409);
    });

    it('POST /auth/register — should reject duplicate guest username', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'another@test.com',
          password: 'TestPass1',
          treeName: 'Another Tree',
          guestUsername: 'doe_guest',
          guestPassword: 'Guest123',
        })
        .expect(409);
    });

    it('POST /auth/login/owner — should login with correct credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login/owner')
        .send({ email: 'owner@test.com', password: 'TestPass1' })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.type).toBe('owner');
      expect(res.body.trees).toHaveLength(1);

      // Refresh token from login
      ownerToken = res.body.accessToken;
    });

    it('POST /auth/login/owner — should reject wrong password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login/owner')
        .send({ email: 'owner@test.com', password: 'WrongPass1' })
        .expect(401);
    });

    it('POST /auth/login/owner — should reject non-existent email', async () => {
      await request(app.getHttpServer())
        .post('/auth/login/owner')
        .send({ email: 'nobody@test.com', password: 'TestPass1' })
        .expect(401);
    });

    it('POST /auth/login/guest — should login with guest credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login/guest')
        .send({ username: 'doe_guest', password: 'Guest123' })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.type).toBe('guest');
      expect(res.body.treeId).toBe(treeId);
      expect(res.body.treeName).toBe('Doe Family');

      guestToken = res.body.accessToken;
    });

    it('POST /auth/login/guest — should reject wrong guest password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login/guest')
        .send({ username: 'doe_guest', password: 'WrongGuest' })
        .expect(401);
    });

    it('GET /auth/me — should return owner info', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.type).toBe('owner');
      expect(res.body.email).toBe('owner@test.com');
      expect(res.body.trees).toHaveLength(1);
    });

    it('GET /auth/me — should return guest info', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(200);

      expect(res.body.type).toBe('guest');
      expect(res.body.treeId).toBe(treeId);
    });

    it('GET /auth/me — should reject unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('GET /auth/profile — should return owner profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.userId).toBe(userId);
      expect(res.body.email).toBe('owner@test.com');
      expect(res.body.trees).toHaveLength(1);
    });

    it('GET /auth/profile — should reject guest access', async () => {
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(403);
    });

    it('PATCH /auth/profile — should update name', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/profile')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ firstName: 'John', lastName: 'Doe' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('PATCH /auth/profile — should update password with correct current', async () => {
      await request(app.getHttpServer())
        .patch('/auth/profile')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ currentPassword: 'TestPass1', newPassword: 'NewPass1!' })
        .expect(200);

      // Verify new password works
      const login = await request(app.getHttpServer())
        .post('/auth/login/owner')
        .send({ email: 'owner@test.com', password: 'NewPass1!' })
        .expect(200);

      ownerToken = login.body.accessToken;
    });

    it('POST /auth/forgot-password — should accept any email (no leak)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'nonexistent@test.com' })
        .expect(200);

      expect(res.body.message).toContain('If an account');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. PERSON CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  let progenitorId: number;
  let spouseId: number;
  let childId: number;

  describe('Person CRUD', () => {
    it('POST /persons — should create progenitor (first person)', async () => {
      const res = await request(app.getHttpServer())
        .post('/persons')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .send({
          firstName: 'Adam',
          lastName: 'Doe',
          gender: 'male',
          birthDate: '1950',
        })
        .expect(201);

      expect(res.body.firstName).toBe('Adam');
      expect(res.body.progenitor).toBe(true);
      progenitorId = res.body.id;
    });

    it('POST /persons — should create child with father', async () => {
      const res = await request(app.getHttpServer())
        .post('/persons')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .send({
          firstName: 'Cain',
          lastName: 'Doe',
          gender: 'male',
          birthDate: '1975',
          fatherId: progenitorId,
        })
        .expect(201);

      expect(res.body.firstName).toBe('Cain');
      expect(res.body.fatherId).toBe(progenitorId);
      childId = res.body.id;
    });

    it('POST /persons — should create spouse linked via children', async () => {
      const res = await request(app.getHttpServer())
        .post('/persons')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .send({
          firstName: 'Eve',
          lastName: 'Doe',
          gender: 'female',
          birthDate: '1952',
          childrenIds: [childId],
        })
        .expect(201);

      expect(res.body.firstName).toBe('Eve');
      spouseId = res.body.id;

      // Verify that Cain's motherId was auto-linked to Eve
      const child = await request(app.getHttpServer())
        .get(`/persons/${childId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .expect(200);

      expect(child.body.motherId).toBe(spouseId);
    });

    it('POST /persons — should reject child born before father', async () => {
      await request(app.getHttpServer())
        .post('/persons')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .send({
          firstName: 'Impossible',
          lastName: 'Doe',
          gender: 'male',
          birthDate: '1940',
          fatherId: progenitorId,
        })
        .expect(400);
    });

    it('POST /persons — should reject wrong gender for father', async () => {
      await request(app.getHttpServer())
        .post('/persons')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .send({
          firstName: 'Bad',
          lastName: 'Doe',
          gender: 'male',
          birthDate: '1980',
          fatherId: spouseId, // Eve is female
        })
        .expect(400);
    });

    it('POST /persons — should reject cross-generational parents (grandmother as mother)', async () => {
      // progenitorId = Adam (grandfather), spouseId = Eve (grandmother)
      // childId = Seth (son of Adam + Eve)
      // Try to create person with father=Seth, mother=Eve — Eve is Seth's own mother!
      await request(app.getHttpServer())
        .post('/persons')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .send({
          firstName: 'Invalid',
          lastName: 'Person',
          gender: 'male',
          birthDate: '2005',
          fatherId: childId, // Seth
          motherId: spouseId, // Eve (Seth's mother — ancestor of Seth!)
        })
        .expect(400);
    });

    it('GET /persons — should list all persons in tree', async () => {
      const res = await request(app.getHttpServer())
        .get('/persons')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .expect(200);

      expect(res.body).toHaveLength(3);
    });

    it('GET /persons — guest should also list all persons', async () => {
      const res = await request(app.getHttpServer())
        .get('/persons')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(200);

      expect(res.body).toHaveLength(3);
    });

    it('GET /persons?name=Adam — should search by name', async () => {
      const res = await request(app.getHttpServer())
        .get('/persons')
        .query({ name: 'Adam' })
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].firstName).toBe('Adam');
    });

    it('GET /persons/progenitor — should return the root ancestor', async () => {
      const res = await request(app.getHttpServer())
        .get('/persons/progenitor')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .expect(200);

      expect(res.body.id).toBe(progenitorId);
      expect(res.body.progenitor).toBe(true);
    });

    it('GET /persons/:id — should return a single person', async () => {
      const res = await request(app.getHttpServer())
        .get(`/persons/${childId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .expect(200);

      expect(res.body.firstName).toBe('Cain');
    });

    it('PATCH /persons/:id — should update person', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/persons/${childId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .send({ firstName: 'Abel', trivia: 'Updated name' })
        .expect(200);

      expect(res.body.firstName).toBe('Abel');
      expect(res.body.trivia).toBe('Updated name');
    });

    it('POST /persons — guest should not be allowed to create', async () => {
      await request(app.getHttpServer())
        .post('/persons')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          firstName: 'Guest',
          lastName: 'User',
          gender: 'male',
          birthDate: '1980',
          fatherId: progenitorId,
        })
        .expect(403);
    });

    it('DELETE /persons/:id — should reject deleting person with children', async () => {
      await request(app.getHttpServer())
        .delete(`/persons/${progenitorId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .expect(400);
    });

    it('DELETE /persons/:id — should delete person without children', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/persons/${childId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .expect(200);

      expect(res.body.message).toContain('deleted');
    });

    it('POST /persons — should recreate child for subsequent tests', async () => {
      const res = await request(app.getHttpServer())
        .post('/persons')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .send({
          firstName: 'Seth',
          lastName: 'Doe',
          gender: 'male',
          birthDate: '1980',
          fatherId: progenitorId,
          motherId: spouseId,
        })
        .expect(201);

      childId = res.body.id;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. PARTNERSHIPS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Partnership Flow', () => {
    it('POST /persons/partnerships — should create partnership', async () => {
      const res = await request(app.getHttpServer())
        .post('/persons/partnerships')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .send({
          person1Id: progenitorId,
          person2Id: spouseId,
          marriageDate: '1972-06-15',
          marriagePlace: 'New York',
        })
        .expect(201);

      expect(res.body.person1Id).toBe(progenitorId);
      expect(res.body.person2Id).toBe(spouseId);
      expect(res.body.marriagePlace).toBe('New York');
    });

    it('GET /persons/partnerships/all — should list all partnerships', async () => {
      const res = await request(app.getHttpServer())
        .get('/persons/partnerships/all')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].marriagePlace).toBe('New York');
    });

    it('GET /persons/partnerships/pair — should find partnership by pair', async () => {
      const res = await request(app.getHttpServer())
        .get('/persons/partnerships/pair')
        .query({ person1Id: progenitorId, person2Id: spouseId })
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .expect(200);

      expect(res.body.marriageDate).toBe('1972-06-15');
    });

    it('POST /persons/partnerships — should update existing partnership (divorce)', async () => {
      const res = await request(app.getHttpServer())
        .post('/persons/partnerships')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .send({
          person1Id: progenitorId,
          person2Id: spouseId,
          divorced: true,
          divorceDate: '1990-01-01',
        })
        .expect(201);

      expect(res.body.divorced).toBe(true);
      expect(res.body.divorceDate).toBe('1990-01-01');
    });

    it('GET /persons/partnerships/all — guest can view partnerships', async () => {
      const res = await request(app.getHttpServer())
        .get('/persons/partnerships/all')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3b. LINK CHILDREN — CROSS-GENERATIONAL GUARD
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Link Children', () => {
    it('PATCH /persons/:id/link-children — should reject linking grandmother as mother', async () => {
      // childId = Seth (son of Adam + Eve)
      // Try to link Eve (spouseId, Seth's mother) as mother of Seth — already is, but
      // create a grandchild first to test the real scenario
      const grandchild = await request(app.getHttpServer())
        .post('/persons')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .send({
          firstName: 'Grandchild',
          lastName: 'Test',
          gender: 'male',
          birthDate: '2005',
          fatherId: childId, // Seth is father
        })
        .expect(201);

      const grandchildId = grandchild.body.id;

      // Now try to link Eve (grandmother) as mother of Grandchild
      // Eve is an ancestor of Seth (Grandchild's father)
      const res = await request(app.getHttpServer())
        .patch(`/persons/${spouseId}/link-children`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .send({
          childrenIds: [grandchildId],
          parentType: 'mother',
        })
        .expect(400);

      expect(res.body.message).toContain('ancestor');

      // Clean up
      await request(app.getHttpServer())
        .delete(`/persons/${grandchildId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .expect(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. PROMOTE ANCESTOR & ORPHAN CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Promote Ancestor', () => {
    it('POST /persons/promote-ancestor — should create new root above progenitor', async () => {
      const res = await request(app.getHttpServer())
        .post('/persons/promote-ancestor')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .send({
          firstName: 'Grandfather',
          lastName: 'Doe',
          gender: 'male',
          birthDate: '1920',
          relationship: 'father',
          currentProgenitorId: progenitorId,
        })
        .expect(201);

      expect(res.body.firstName).toBe('Grandfather');
      expect(res.body.progenitor).toBe(true);
    });

    it('GET /persons/progenitor — progenitor should be the new ancestor', async () => {
      const res = await request(app.getHttpServer())
        .get('/persons/progenitor')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .expect(200);

      expect(res.body.firstName).toBe('Grandfather');
      expect(res.body.progenitor).toBe(true);
    });

    it('POST /persons/promote-ancestor — should reject ancestor younger than progenitor', async () => {
      // Grandfather (born 1920) is now the progenitor
      // Try to add a "father" born in 1930 — younger than progenitor
      await request(app.getHttpServer())
        .post('/persons/promote-ancestor')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .send({
          firstName: 'Younger',
          lastName: 'Dad',
          gender: 'male',
          birthDate: '1930',
          relationship: 'father',
          currentProgenitorId: (
            await request(app.getHttpServer())
              .get('/persons/progenitor')
              .set('Authorization', `Bearer ${ownerToken}`)
              .set('X-Tree-Id', treeId)
          ).body.id,
        })
        .expect(400);
    });

    it('POST /persons/promote-ancestor — should reject ancestor under min parent age', async () => {
      const progenitor = (
        await request(app.getHttpServer())
          .get('/persons/progenitor')
          .set('Authorization', `Bearer ${ownerToken}`)
          .set('X-Tree-Id', treeId)
      ).body;

      await request(app.getHttpServer())
        .post('/persons/promote-ancestor')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .send({
          firstName: 'TooYoung',
          lastName: 'Father',
          gender: 'male',
          birthDate: '1915', // only 5 years older than 1920
          relationship: 'father',
          currentProgenitorId: progenitor.id,
        })
        .expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. TREE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  let secondTreeId: string;

  describe('Multi-Tree Support', () => {
    it('GET /trees — should list owner trees', async () => {
      const res = await request(app.getHttpServer())
        .get('/trees')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Doe Family');
    });

    it('POST /trees — should create a second tree', async () => {
      const res = await request(app.getHttpServer())
        .post('/trees')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          treeName: 'Smith Family',
          guestUsername: 'smith_guest',
          guestPassword: 'Guest456',
        })
        .expect(201);

      expect(res.body.name).toBe('Smith Family');
      secondTreeId = res.body.id;
    });

    it('GET /trees — should now list two trees', async () => {
      const res = await request(app.getHttpServer())
        .get('/trees')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body).toHaveLength(2);
    });

    it('GET /trees/:id — should get tree details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/trees/${secondTreeId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.name).toBe('Smith Family');
      expect(res.body.guestUsername).toBe('smith_guest');
    });

    it('PATCH /trees/:id — should rename tree', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/trees/${secondTreeId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Smith-Jones Family' })
        .expect(200);

      expect(res.body.name).toBe('Smith-Jones Family');
    });

    it('PATCH /trees/:id/guest-password — should update guest password', async () => {
      await request(app.getHttpServer())
        .patch(`/trees/${secondTreeId}/guest-password`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ newGuestPassword: 'NewGuest789' })
        .expect(200);

      // Verify the new guest password works
      await request(app.getHttpServer())
        .post('/auth/login/guest')
        .send({ username: 'smith_guest', password: 'NewGuest789' })
        .expect(200);
    });

    it('POST /persons — second tree should be isolated', async () => {
      // Create a person in the second tree
      await request(app.getHttpServer())
        .post('/persons')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', secondTreeId)
        .send({
          firstName: 'Bob',
          lastName: 'Smith',
          gender: 'male',
          birthDate: '1960',
        })
        .expect(201);

      // First tree should still have its own persons
      const tree1Persons = await request(app.getHttpServer())
        .get('/persons')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', treeId)
        .expect(200);

      // Second tree should only have Bob
      const tree2Persons = await request(app.getHttpServer())
        .get('/persons')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tree-Id', secondTreeId)
        .expect(200);

      expect(tree2Persons.body).toHaveLength(1);
      expect(tree2Persons.body[0].firstName).toBe('Bob');
      // First tree should not contain Bob
      expect(
        tree1Persons.body.find((p: any) => p.firstName === 'Bob'),
      ).toBeUndefined();
    });

    it('DELETE /trees/:id — should delete tree and cascade persons', async () => {
      await request(app.getHttpServer())
        .delete(`/trees/${secondTreeId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      // Tree should be gone
      await request(app.getHttpServer())
        .get(`/trees/${secondTreeId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });

    it('POST /trees — should reject duplicate guest username', async () => {
      await request(app.getHttpServer())
        .post('/trees')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          treeName: 'Duplicate Guest',
          guestUsername: 'doe_guest',
          guestPassword: 'Guest123',
        })
        .expect(409);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. SYSTEM ADMIN
  // ═══════════════════════════════════════════════════════════════════════════

  let sysAdminToken: string;

  describe('System Admin', () => {
    it('POST /system-admin/login — should login with seeded credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/system-admin/login')
        .send({ username: 'sysadmin', password: 'AdminPass123!' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      sysAdminToken = res.body.accessToken;
    });

    it('GET /system-admin/me — should return admin info', async () => {
      const res = await request(app.getHttpServer())
        .get('/system-admin/me')
        .set('Authorization', `Bearer ${sysAdminToken}`)
        .expect(200);

      expect(res.body.username).toBe('sysadmin');
    });

    it('GET /system-admin/dashboard — should return stats', async () => {
      const res = await request(app.getHttpServer())
        .get('/system-admin/dashboard')
        .set('Authorization', `Bearer ${sysAdminToken}`)
        .expect(200);

      expect(res.body.totalTrees).toBeGreaterThanOrEqual(1);
      expect(res.body.totalPersons).toBeGreaterThanOrEqual(1);
    });

    it('GET /system-admin/trees — should list all trees', async () => {
      const res = await request(app.getHttpServer())
        .get('/system-admin/trees')
        .set('Authorization', `Bearer ${sysAdminToken}`)
        .expect(200);

      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /system-admin/trees/:id — should get tree detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/system-admin/trees/${treeId}`)
        .set('Authorization', `Bearer ${sysAdminToken}`)
        .expect(200);

      expect(res.body.name).toBe('Doe Family');
      expect(res.body.persons).toBeDefined();
    });

    it('GET /system-admin/trees/:id/export — should export tree as JSON', async () => {
      const res = await request(app.getHttpServer())
        .get(`/system-admin/trees/${treeId}/export`)
        .set('Authorization', `Bearer ${sysAdminToken}`)
        .expect(200);

      expect(res.body.tree).toBeDefined();
      expect(res.body.persons).toBeDefined();
    });

    it('GET /system-admin/dashboard — should reject non-admin tokens', async () => {
      await request(app.getHttpServer())
        .get('/system-admin/dashboard')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. ACCESS CONTROL
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Access Control', () => {
    it('should reject requests without auth token', async () => {
      await request(app.getHttpServer()).get('/persons').expect(401);
      await request(app.getHttpServer()).get('/trees').expect(401);
    });

    it('guest should not be able to create persons', async () => {
      await request(app.getHttpServer())
        .post('/persons')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          firstName: 'Hack',
          lastName: 'Attempt',
          gender: 'male',
          birthDate: '2000',
        })
        .expect(403);
    });

    it('guest should not be able to delete persons', async () => {
      await request(app.getHttpServer())
        .delete(`/persons/${childId}`)
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(403);
    });

    it('guest should not be able to update persons', async () => {
      await request(app.getHttpServer())
        .patch(`/persons/${childId}`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ firstName: 'Hacked' })
        .expect(403);
    });

    it('guest should not be able to manage trees', async () => {
      await request(app.getHttpServer())
        .post('/trees')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          treeName: 'Hack Tree',
          guestUsername: 'hack_guest',
          guestPassword: 'hack123',
        })
        .expect(403);
    });

    it('owner should not access another owner tree', async () => {
      // Register a second owner
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'other@test.com',
          password: 'TestPass1',
          treeName: 'Other Family',
          guestUsername: 'other_guest',
          guestPassword: 'Guest123',
        })
        .expect(201);

      const otherToken = res.body.accessToken;

      // Try to access first owner's tree persons
      await request(app.getHttpServer())
        .get('/persons')
        .set('Authorization', `Bearer ${otherToken}`)
        .set('X-Tree-Id', treeId)
        .expect(403);
    });
  });
});
