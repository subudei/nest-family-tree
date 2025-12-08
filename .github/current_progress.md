# Family Tree Application - Backend API

> **Learning Project**: Building a NestJS REST API for a Family Tree Visualization Application

This is the backend API for a family tree visualization app, built with **NestJS** and **TypeORM**. This project serves as a hands-on learning experience for mastering NestJS fundamentals, RESTful API design, database management, and authentication patterns.

---

## 📋 Project Overview

### What is This App?

A **Family Tree Management System** that allows users to:

- View interactive family tree visualizations
- Create and manage family members (persons)
- Track relationships (parents, children, marriages)
- Support complex genealogy (multiple marriages, unknown parents, multi-generational data)

### Tech Stack

- **Framework**: NestJS (TypeScript)
- **Database**: SQLite (temporary - migrating to PostgreSQL later)
- **ORM**: TypeORM
- **Validation**: class-validator & class-transformer
- **Testing**: Jest (unit & e2e tests)
- **Frontend**: Next.js 14+ (separate repository - see `.github/frontend_app.md`)

---

## 🎯 Learning Goals

This project is designed to learn:

1. **NestJS Fundamentals**
   - Controllers, Services, Modules architecture
   - Dependency Injection
   - DTOs and Validation Pipes
   - Exception handling

2. **Database & ORM**
   - TypeORM entity design
   - Migrations and seeding
   - Complex relationships (self-referencing)
   - Transitioning from SQLite to PostgreSQL

3. **API Design**
   - RESTful endpoints
   - CRUD operations
   - Query parameters & filters
   - Error responses

4. **Authentication & Authorization**
   - JWT-based auth
   - Role-based access control (Admin vs Viewer)
   - Guards and decorators

---

## 🚀 Current State of the App

### ✅ What's Implemented

#### **1. Person Entity** (`src/persons/person.entity.ts`)

Core data model with all required fields:

```typescript
{
  id: number;              // Auto-generated primary key
  firstName: string;       // Required
  lastName: string;        // Required
  gender: 'male' | 'female'; // Required (varchar workaround for SQLite)
  birthDate?: string;      // Optional ISO date string (YYYY-MM-DD)
  deathDate?: string;      // Optional ISO date string
  trivia?: string;         // Optional notes/stories
  progenitor: boolean;     // Flag for root ancestor (default: false)
  fatherId?: number;       // Optional parent reference
  motherId?: number;       // Optional parent reference
}
```

**Note**: Currently using numeric IDs for parents. TypeORM relations commented out for later migration.

#### **2. Basic API Endpoints**

- **`POST /persons`** - Create a new person
- **`GET /persons`** - Get all persons

#### **3. Data Validation**

- DTO with class-validator decorators
- Gender enum validation
- Required field checks
- Optional field handling

#### **4. Database Setup**

- SQLite configured with TypeORM
- Auto-synchronization enabled (dev only)
- Database file: `family-tree-db.sqlite`

#### **5. Project Structure**

```
src/
├── app.module.ts           # Root module with TypeORM config
├── main.ts                 # App bootstrap
└── persons/
    ├── person.entity.ts
    ├── persons.controller.ts
    ├── persons.service.ts
    ├── persons.module.ts
    └── dtos/
        └── create-person.dto.ts
```

---

## 📚 Next Steps - Your Learning Path

### **Phase 1: Complete CRUD Operations** (Start Here!)

#### 🎯 **Step 1.1: Get Single Person**

**Goal**: Learn about route parameters and entity lookups

**Task**: Implement `GET /persons/:id`

- Add method in `PersonsService` to find by ID
- Add controller route with `@Param()` decorator
- Handle case when person not found (throw `NotFoundException`)

**Files to modify**:

- `persons.service.ts`
- `persons.controller.ts`

**Resources**:

- [NestJS Controllers - Route parameters](https://docs.nestjs.com/controllers#route-parameters)
- [NestJS Exception filters](https://docs.nestjs.com/exception-filters)

---

#### 🎯 **Step 1.2: Update Person**

**Goal**: Learn about PATCH requests and partial updates

**Task**: Implement `PATCH /persons/:id`

- Create `UpdatePersonDto` (make all fields optional)
- Add update method in service using `save()` or `update()`
- Add controller route
- Test updating individual fields

**Files to create/modify**:

- `dtos/update-person.dto.ts` (new file)
- `persons.service.ts`
- `persons.controller.ts`

**Resources**:

- [NestJS DTOs](https://docs.nestjs.com/techniques/validation#auto-validation)
- [TypeORM Repository API](https://typeorm.io/repository-api)

---

#### 🎯 **Step 1.3: Delete Person**

**Goal**: Learn about DELETE requests and cascade considerations

**Task**: Implement `DELETE /persons/:id`

- Add delete method in service
- Consider: What happens to children when parent is deleted?
- Return appropriate status code (204 No Content)
- Add controller route

**Files to modify**:

- `persons.service.ts`
- `persons.controller.ts`

**Challenge Question**: Should you prevent deletion if person has children? Or set their parent IDs to null?

---

### **Phase 2: Data Integrity & Business Logic**

#### 🎯 **Step 2.1: Parent Validation**

**Goal**: Learn custom validation logic

**Task**: Add validation to ensure parent IDs exist

- Before creating/updating, check if `fatherId` and `motherId` exist in database
- Throw `BadRequestException` if parent doesn't exist
- Check gender matches parent type (fatherId must be male, motherId must be female)

**Files to modify**:

- `persons.service.ts`

---

#### 🎯 **Step 2.2: Progenitor Logic**

**Goal**: Learn business rule enforcement

**Task**: Ensure only ONE progenitor exists

- When setting `progenitor: true`, check if another progenitor exists
- Either prevent creation or auto-set others to false
- Add endpoint: `GET /persons/progenitor` to find the root

**Files to modify**:

- `persons.service.ts`
- `persons.controller.ts`

---

#### 🎯 **Step 2.3: Date Validation**

**Goal**: Learn custom validators

**Task**: Add date logic validation

- Death date must be after birth date
- Create custom validator decorator
- Test edge cases

**Files to create/modify**:

- Custom validator in DTOs or create a `validators/` folder

**Resources**:

- [class-validator custom validators](https://github.com/typestack/class-validator#custom-validation-classes)

---

### **Phase 3: Advanced Queries**

#### 🎯 **Step 3.1: Get Children of Person**

**Goal**: Learn query building

**Task**: Implement `GET /persons/:id/children`

- Find all persons where `fatherId === id` OR `motherId === id`
- Return array of Person objects

**Files to modify**:

- `persons.service.ts`
- `persons.controller.ts`

---

#### 🎯 **Step 3.2: Get Parents of Person**

**Goal**: Learn about joins and related data

**Task**: Implement `GET /persons/:id/parents`

- Fetch person by ID
- Separately fetch father and mother if IDs exist
- Return object: `{ father: Person | null, mother: Person | null }`

---

#### 🎯 **Step 3.3: Database Seeding**

**Goal**: Learn about data seeding for development

**Task**: Create seed script with sample family data

- Create a seeder service or script
- Import data matching frontend's `mockFamilySimple.ts`
- Run on app startup in dev mode or via CLI command

**Resources**:

- [TypeORM Migrations and Seeding](https://typeorm.io/migrations)
- Create a `database/` folder with seed files

---

### **Phase 4: Migration to PostgreSQL**

#### 🎯 **Step 4.1: PostgreSQL Setup**

**Goal**: Learn production database setup

**Task**: Switch from SQLite to PostgreSQL

- Install `pg` package
- Update `TypeOrmModule.forRoot()` config
- Use environment variables for connection
- Test migrations

**Files to modify**:

- `app.module.ts`
- Create `.env` file
- Install `@nestjs/config`

**Resources**:

- [NestJS Configuration](https://docs.nestjs.com/techniques/configuration)
- [TypeORM with PostgreSQL](https://typeorm.io/data-source-options#postgres--cockroachdb-data-source-options)

---

#### 🎯 **Step 4.2: Enable TypeORM Relations**

**Goal**: Learn about ORM relationships

**Task**: Uncomment and enable `@ManyToOne` relations in entity

- Replace numeric IDs with proper relations
- Test cascade loading
- Update queries to use `relations` option

**Files to modify**:

- `person.entity.ts`
- `persons.service.ts` (queries)

---

### **Phase 5: Authentication & Authorization**

#### 🎯 **Step 5.1: User Entity & Auth Module**

**Goal**: Learn authentication basics

**Task**: Create User model and auth system

- Create `User` entity (id, email, password, role)
- Hash passwords with bcrypt
- Create AuthModule, AuthService, AuthController
- Implement registration and login endpoints

**Files to create**:

- `src/users/` module
- `src/auth/` module

**Resources**:

- [NestJS Authentication](https://docs.nestjs.com/security/authentication)

---

#### 🎯 **Step 5.2: JWT Strategy**

**Goal**: Learn JWT-based auth

**Task**: Implement JWT tokens

- Install `@nestjs/jwt` and `@nestjs/passport`
- Create JWT strategy
- Return token on login
- Validate token on protected routes

---

#### 🎯 **Step 5.3: Role-Based Access Control**

**Goal**: Learn guards and decorators

**Task**: Implement admin/viewer roles

- Create `@Roles()` decorator
- Create `RolesGuard`
- Protect Person write operations (POST, PATCH, DELETE) - admin only
- Allow GET requests for all authenticated users

**Files to create**:

- `guards/roles.guard.ts`
- `decorators/roles.decorator.ts`

---

### **Phase 6: Testing & Polish**

#### 🎯 **Step 6.1: Unit Tests**

- Write tests for `PersonsService`
- Mock repository
- Test edge cases

#### 🎯 **Step 6.2: E2E Tests**

- Test full API flows
- Test authentication flows

#### 🎯 **Step 6.3: Error Handling**

- Create custom exception filters
- Standardize error responses
- Add logging

#### 🎯 **Step 6.4: CORS Configuration**

- Enable CORS for frontend (Next.js app)
- Configure allowed origins

---

## 🛠️ Development

### Installation

```bash
npm install
```

### Running the App

```bash
# Development mode with watch
npm run start:dev

# Production mode
npm run start:prod
```

### Testing Endpoints

Use the `request.http` file with REST Client extension in VS Code, or use Postman/Thunder Client.

### Running Tests

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

---

## 📖 Resources for Learning

### NestJS

- [Official Documentation](https://docs.nestjs.com)
- [NestJS Fundamentals Course](https://courses.nestjs.com/)
- [NestJS GitHub Examples](https://github.com/nestjs/nest/tree/master/sample)

### TypeORM

- [TypeORM Documentation](https://typeorm.io/)
- [Entity Relations Guide](https://typeorm.io/relations)

### PostgreSQL

- [PostgreSQL Tutorial](https://www.postgresqltutorial.com/)
- [TypeORM PostgreSQL Guide](https://typeorm.io/data-source-options#postgres--cockroachdb-data-source-options)

---

## 🗂️ Project Structure (Future)

```
src/
├── app.module.ts
├── main.ts
├── auth/                    # Authentication module (Phase 5)
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── auth.module.ts
│   ├── strategies/
│   │   └── jwt.strategy.ts
│   └── guards/
│       └── jwt-auth.guard.ts
├── users/                   # User management (Phase 5)
│   ├── user.entity.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── users.module.ts
├── persons/                 # Person management (Current)
│   ├── person.entity.ts
│   ├── persons.controller.ts
│   ├── persons.service.ts
│   ├── persons.module.ts
│   └── dtos/
│       ├── create-person.dto.ts
│       └── update-person.dto.ts
├── database/                # Seeders and migrations (Phase 3)
│   └── seeders/
│       └── family.seeder.ts
├── common/                  # Shared code (Phase 6)
│   ├── decorators/
│   ├── guards/
│   ├── filters/
│   └── interceptors/
└── config/                  # Configuration (Phase 4)
    └── database.config.ts
```

---

## 📝 Notes

- **SQLite is temporary**: This is for learning and quick prototyping. We'll migrate to PostgreSQL in Phase 4.
- **Relations are simplified**: Using numeric IDs for now. Will enable TypeORM relations later.
- **No authentication yet**: All endpoints are public. Auth comes in Phase 5.
- **Frontend separate**: See `.github/frontend_app.md` for frontend architecture details.

---

## 🎓 Learning Tips

1. **One feature at a time**: Don't rush. Understand each concept before moving on.
2. **Read the errors**: NestJS error messages are helpful. Read them carefully.
3. **Test as you go**: Use `request.http` to test each endpoint after implementation.
4. **Ask questions**: Comment your code with questions/notes for later review.
5. **Commit often**: Git commit after each completed step.

---

## 📧 Frontend Integration

The frontend expects this exact JSON structure:

```json
[
  {
    "id": 1,
    "firstName": "John",
    "lastName": "Doe",
    "gender": "male",
    "progenitor": true,
    "birthDate": "1950-01-15",
    "deathDate": null,
    "trivia": "Root ancestor",
    "fatherId": null,
    "motherId": null
  }
]
```

✅ Your current API already returns this format perfectly!

---

## 🚦 Current Status

**Last Updated**: December 2, 2025

- ✅ Phase 1: Step 1.0 - Basic CRUD (Create, Read All)
- ✅ Phase 1: Step 1.1 - Get Single Person by ID
- ✅ Phase 1: Step 1.2 - Search by name (firstName/lastName with LIKE)
- ✅ Phase 1: Step 1.3 - Delete Person (with child protection + success message)
- ✅ Phase 2: Step 2.1 - Parent Validation (existence + gender check)
- ✅ Phase 2: Step 2.3 - Date Validation (birth/death dates, parent age ≥ 13)
- ✅ Phase 2: Step P.1 - PATCH /persons/:id (with self-parenting check)
- ✅ Phase 2: Step P.2 - GET /persons/progenitor
- ✅ Phase 2: Step P.3 - POST /persons/promote-ancestor (with QueryRunner transaction!)
- ❌ **Next Up**: Connect Next.js frontend to API (enable CORS, React Query setup)

**Database**: SQLite (`family-tree-db.sqlite`)  
**Port**: 3001  
**Environment**: Development

---

## ✅ Completed - Progenitor Management

### **Step P.1: PATCH Endpoint** ✅

- UpdatePersonDto with gender removed (can't change gender)
- Self-parenting validation
- Parent/date validation on updates

### **Step P.2: GET /persons/progenitor** ✅

- Returns current progenitor or null

### **Step P.3: POST /persons/promote-ancestor** ✅

- Atomic transaction using QueryRunner
- Creates new ancestor with progenitor: true
- Updates old progenitor: progenitor: false + fatherId/motherId link
- Rollback on failure

---

## 🎯 Next Steps - Frontend Integration

### **Step F.1: Enable CORS in NestJS**

**File**: `src/main.ts`

```typescript
app.enableCors({
  origin: 'http://localhost:3000',
  credentials: true,
});
```

### **Step F.2: Setup React Query in Next.js**

- Install @tanstack/react-query
- Create QueryClientProvider
- Create API service functions

### **Step F.3: Connect Family Tree to Real API**

- Replace mock data with API calls
- Implement loading/error states

---

## 🎓 Key Concepts Learned

### Transactions (QueryRunner)

```typescript
const queryRunner = this.dataSource.createQueryRunner();
await queryRunner.connect();
await queryRunner.startTransaction();

try {
  // Do multiple operations
  await queryRunner.commitTransaction();
} catch (error) {
  await queryRunner.rollbackTransaction();
  throw error;
} finally {
  await queryRunner.release();
}
```

### Why Transactions?

Multiple DB operations as ONE unit - all succeed or all fail.
Prevents data corruption (e.g., two progenitors).

---

if (updatePersonDto.fatherId === id || updatePersonDto.motherId === id) {
throw new BadRequestException('A person cannot be their own parent');
}

````

---

### **Step P.2: GET /persons/progenitor**

**Goal**: Retrieve the current root ancestor

**Task**: Implement endpoint to find the progenitor

- Query database for person where `progenitor = true`
- Return the person or null if none exists
- Frontend needs this to show warning in Add Person form

**Files to modify**:

- `persons.service.ts` - add `findProgenitor()` method
- `persons.controller.ts` - add GET route

**Service method**:

```typescript
async findProgenitor(): Promise<Person | null> {
  return this.personRepository.findOneBy({ progenitor: true });
}
````

**Controller route**:

```typescript
@Get('/progenitor')
async getProgenitor() {
  return this.personsService.findProgenitor();
}
```

**⚠️ Route order matters!**
Put `/progenitor` BEFORE `/:id` or NestJS will treat "progenitor" as an ID!

---

### **Step P.3: POST /persons/promote-ancestor** ⭐ (The Big One!)

**Goal**: Atomic transaction to add ancestor above current progenitor

**Why is this special?**
This is NOT a regular create. It must do 3 things atomically:

1. Create the new ancestor with `progenitor: true`
2. Update the old progenitor to `progenitor: false`
3. Set the old progenitor's parent (fatherId or motherId) to the new ancestor

If any step fails, ALL must rollback. Tree integrity depends on this!

---

#### **Create the DTO**

**File to create**: `src/persons/dtos/promote-ancestor.dto.ts`

```typescript
import {
  IsInt,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// Nested DTO for the new ancestor data
class NewAncestorDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEnum(['male', 'female'])
  gender: 'male' | 'female';

  @IsOptional()
  @IsString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  deathDate?: string;

  @IsOptional()
  @IsString()
  trivia?: string;
}

export class PromoteAncestorDto {
  @ValidateNested()
  @Type(() => NewAncestorDto)
  newAncestor: NewAncestorDto;

  @IsInt()
  currentProgenitorId: number;

  @IsEnum(['father', 'mother'])
  relationship: 'father' | 'mother';
}
```

---

#### **Implement the Service Method**

**File to modify**: `persons.service.ts`

```typescript
import { DataSource } from 'typeorm';

// Inject DataSource in constructor for transactions
constructor(
  @InjectRepository(Person)
  private personRepository: Repository<Person>,
  private dataSource: DataSource,  // ADD THIS
) {}

async promoteAncestor(dto: PromoteAncestorDto): Promise<Person> {
  // 1. Verify current progenitor exists and IS the progenitor
  const currentProgenitor = await this.findPersonById(dto.currentProgenitorId);

  if (!currentProgenitor.progenitor) {
    throw new BadRequestException(
      `Person ${dto.currentProgenitorId} is not the current progenitor`
    );
  }

  // 2. Validate gender matches relationship
  const expectedGender = dto.relationship === 'father' ? 'male' : 'female';
  if (dto.newAncestor.gender !== expectedGender) {
    throw new BadRequestException(
      `New ${dto.relationship} must be ${expectedGender}`
    );
  }

  // 3. Optional: Validate birth dates (new ancestor should be older)
  if (dto.newAncestor.birthDate && currentProgenitor.birthDate) {
    const ancestorBirth = new Date(dto.newAncestor.birthDate);
    const progenitorBirth = new Date(currentProgenitor.birthDate);
    const ageDiff = (progenitorBirth.getTime() - ancestorBirth.getTime()) / (1000 * 60 * 60 * 24 * 365);

    if (ageDiff < 13) {
      throw new BadRequestException(
        'New ancestor must be at least 13 years older than current progenitor'
      );
    }
  }

  // 4. ATOMIC TRANSACTION - All or nothing!
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // Step A: Create the new ancestor
    const newAncestor = queryRunner.manager.create(Person, {
      ...dto.newAncestor,
      progenitor: true,  // New ancestor becomes progenitor
    });
    await queryRunner.manager.save(newAncestor);

    // Step B: Update old progenitor
    const parentField = dto.relationship === 'father' ? 'fatherId' : 'motherId';
    await queryRunner.manager.update(Person, dto.currentProgenitorId, {
      progenitor: false,           // No longer progenitor
      [parentField]: newAncestor.id, // Link to new ancestor
    });

    // Step C: Commit the transaction
    await queryRunner.commitTransaction();

    return newAncestor;
  } catch (error) {
    // Something went wrong - rollback everything!
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    // Clean up the query runner
    await queryRunner.release();
  }
}
```

---

#### **Add the Controller Route**

**File to modify**: `persons.controller.ts`

```typescript
import { PromoteAncestorDto } from './dtos/promote-ancestor.dto';

@Post('/promote-ancestor')
async promoteAncestor(@Body() promoteAncestorDto: PromoteAncestorDto) {
  return this.personsService.promoteAncestor(promoteAncestorDto);
}
```

**⚠️ Route order matters!**
Put `/promote-ancestor` BEFORE `/:id` routes!

---

#### **Test the Endpoint**

Add to `request.http`:

```http
### Promote ancestor - Add father above current progenitor
POST http://localhost:3001/persons/promote-ancestor
Content-Type: application/json

{
  "newAncestor": {
    "firstName": "Tihomir",
    "lastName": "Nemanjić",
    "gender": "male",
    "birthDate": "1070-01-01"
  },
  "currentProgenitorId": 3,
  "relationship": "father"
}
```

---

### **Summary - Implementation Order**

1. **Complete PATCH** - Finish what you started (self-parent check)
2. **GET /progenitor** - Simple query, frontend needs it
3. **Create PromoteAncestorDto** - Define the request shape
4. **Implement promoteAncestor()** - The atomic transaction
5. **Add controller route** - Wire it up
6. **Test!** - Use request.http

---

## 🧠 Key Concepts to Understand

### Why Transactions?

```
Without transaction:
1. Create ancestor ✅
2. Update progenitor ❌ (fails!)
3. Database has TWO progenitors! 💥

With transaction:
1. Create ancestor ✅
2. Update progenitor ❌ (fails!)
3. Transaction ROLLBACK - ancestor deleted too ✅
4. Database unchanged, tree integrity preserved! 🌳
```

### QueryRunner vs Repository

- **Repository**: Simple CRUD, auto-commits each operation
- **QueryRunner**: Manual transaction control, multiple operations as one

### Route Order in NestJS

```typescript
// ❌ WRONG - "progenitor" matches /:id first!
@Get('/:id')
@Get('/progenitor')

// ✅ CORRECT - specific routes before dynamic routes
@Get('/progenitor')
@Get('/:id')
```

---

Good luck with your learning journey! 🚀

> **Remember**: This is a learning project. Take your time, experiment, break things, fix them, and most importantly - understand WHY things work the way they do.
