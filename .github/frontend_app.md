# Family Tree Application - Frontend Documentation

## Application Overview

This is a **Family Tree Visualization Application** built with Next.js 14+ that allows users to view and manage complex family genealogy data with interactive tree visualization, supporting multiple marriages, unknown parents, and multi-generational relationships.

## Frontend Technology Stack

- **Framework**: Next.js 14+ with App Router (TypeScript)
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Forms**: React Hook Form with Zod validation
- **UI Components**: Card, Dialog, Button, Input, Select, Checkbox from shadcn/ui
- **State Management**: React hooks (currently using local state with mock data)
- **Data Flow**: Props drilling (Context API planned for future)

## Person Data Structure

The core data model is the **Person** interface:

```typescript
interface Person {
  id: number; // Unique identifier
  firstName: string; // Person's first name
  lastName: string; // Person's last name
  gender: 'male' | 'female'; // Gender (required)
  progenitor: boolean; // True if this is a root ancestor
  birthDate?: string; // ISO 8601 date string (YYYY-MM-DD)
  deathDate?: string; // ISO 8601 date string (YYYY-MM-DD)
  trivia?: string; // Notes/stories about the person
  father: Person | null; // Reference to father Person object
  mother: Person | null; // Reference to mother Person object
}
```

### Key Characteristics

- **Self-Referencing Relationships**: Each Person has `father` and `mother` properties that reference other Person objects (not IDs)
- **No Children Array**: Children are calculated dynamically by searching all persons where `father` or `mother` matches
- **Nullable Parents**: Parents can be `null` for unknown or root ancestors
- **Progenitor Flag**: Marks the root ancestor(s) of the family tree (typically has both parents as `null`)

## Mock Data Structure

The application currently uses mock data stored in `src/data/mockFamilySimple.ts`. Here's how it's structured:

### Raw Data Format

Mock data starts as a flat array with ID references:

```typescript
const familyData: RawPersonData[] = [
  {
    id: 1,
    progenitor: true,
    firstName: 'John',
    lastName: 'Johnson',
    birthDate: '1930-01-15',
    deathDate: '2010-08-20',
    trivia: 'Successful businessman',
    fatherId: null, // No father (root ancestor)
    motherId: null, // No mother (root ancestor)
    gender: 'male',
  },
  {
    id: 2,
    progenitor: false,
    firstName: 'Anna',
    lastName: 'Smith',
    birthDate: '1932-03-10',
    trivia: "John's first wife",
    fatherId: null,
    motherId: null,
    gender: 'female',
  },
  {
    id: 5,
    progenitor: false,
    firstName: 'Son One',
    lastName: 'Johnson',
    birthDate: '1951-05-12',
    trivia: "John's first son with Anna",
    fatherId: 1, // References John (id: 1)
    motherId: 2, // References Anna (id: 2)
    gender: 'male',
  },
];
```

### Data Transformation Process

The mock data is transformed from flat structure with IDs to nested object references:

1. **First Pass**: Create all Person objects with `father` and `mother` set to `null`
2. **Second Pass**: Link parent references by looking up IDs in a Map
3. **Result**: Person objects with actual object references instead of IDs

```typescript
// Before transformation (raw data)
{ id: 5, fatherId: 1, motherId: 2 }

// After transformation (Person object)
{
  id: 5,
  father: { id: 1, firstName: "John", ... },  // Full Person object
  mother: { id: 2, firstName: "Anna", ... }   // Full Person object
}
```

### Virtual Unknown Persons

When the frontend encounters a child with one parent missing, it creates a virtual Person object:

```typescript
// Example: Child has father but mother is null
{
  id: 100,
  firstName: "Grandson Houndred",
  fatherId: 5,      // Known father
  motherId: null    // Unknown mother
}

// Frontend creates virtual person:
{
  id: -100,                    // Negative ID (virtual)
  firstName: "Unknown",
  lastName: "Mother",
  gender: "female",
  progenitor: false,
  father: null,
  mother: null
}
```

**Virtual Person Characteristics:**

- Negative IDs (e.g., `-Math.abs(childId)`)
- Named "Unknown Mother" or "Unknown Father" based on gender
- Gender is opposite of the known parent
- Displayed with gray background and dashed border in UI
- These are UI-only placeholders, NOT stored in data

## Family Tree Visualization Logic

### How the Tree is Rendered

The frontend builds the family tree visualization using this logic:

1. **Find Root**: Locate the progenitor (person with `progenitor: true`)

2. **Marriage Groups**: For each person, group their children by the other parent:

   ```
   Person → Marriage 1 (Spouse A) → [Children with Spouse A]
         → Marriage 2 (Spouse B) → [Children with Spouse B]
         → Marriage 3 (Unknown)  → [Children with unknown parent]
   ```

3. **Tree Structure**:

   ```
   [Progenitor]
        |
   [Spouse 1] ─┬─ [Child 1]
               └─ [Child 2]
        |
   [Spouse 2] ─┬─ [Child 3]
               ├─ [Child 4]
               └─ [Child 5]
   ```

4. **Visual Features**:
   - Connecting lines between parents and children
   - Branch colors for different family lineages
   - Gray/dashed styling for unknown persons
   - Year of birth displayed under each card

### Helper Functions Used

- `getChildren(person, familyData)` - Returns all children where `father.id === person.id` OR `mother.id === person.id`
- `getHouseholdChildren(person, familyData)` - Includes step-children from spouse's other relationships
- `findProgenitor(familyData)` - Finds the person with `progenitor: true`
- `isAlive(person)` - Returns `true` if `deathDate` is `null`
- `getAge(person)` - Calculates current age or age at death
- `getDisplayName(person, rootPerson, familyData)` - Generates contextual names like "Wife", "Son", etc.
- `getPersonBranchColor(person, progenitor, familyData)` - Returns color based on lineage

### Branch Color System

Different branches of the family tree get distinct colors for visual clarity:

- Progenitor: Blue
- 1st child's branch: Green
- 2nd child's branch: Purple
- 3rd child's branch: Orange
- 4th child's branch: Red
- And so on...

This helps users visually track which lineage each person belongs to.

## Form Validation

The application uses Zod schemas for form validation:

```typescript
const formSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  gender: z.enum(['male', 'female']),
  progenitor: z.boolean(),
  birthDate: z.string().optional(),
  deathDate: z.string().optional(),
  trivia: z.string().optional(),
  fatherId: z.number().nullable().optional(),
  motherId: z.number().nullable().optional(),
});
```

**Current Form Behavior:**

- Forms use React Hook Form with Zod resolver
- Parent selection dropdowns use person IDs
- Currently logs to console (not connected to state/backend)
- Gender field uses Select component with "male"/"female" options

## Current Features & Components

### Main Pages

- `/` - Landing page
- `/tree` - Interactive family tree visualization
- `/new-person` - Form to add new person

### Key Components

**FamilyTree** (`src/components/FamilyTree.tsx`)

- Renders the entire family tree starting from progenitor
- Creates marriage blocks with connecting lines
- Handles unknown spouse visualization
- Manages vertical/horizontal line positioning

**PersonCard** (`src/components/PersonCard.tsx`)

- Modal that displays person details
- Shows birth/death dates, parents, children, trivia
- Admin buttons: Edit, Link to Existing, Delete
- Currently has placeholder admin check

**AddPersonForm** (`src/components/AddPersonForm.tsx`)

- Form with all Person fields
- Zod validation
- Parent selection (currently empty dropdowns)
- Progenitor checkbox

### Styling Patterns

- Cards use shadcn/ui Card components
- Colors: Tailwind CSS classes (bg-blue-50, border-blue-600, etc.)
- Unknown persons: `bg-gray-100 border-dashed border-gray-400 opacity-75`
- Progenitor: `border-blue-600 bg-blue-50`
- Living status: Green badge, Deceased: Gray badge

## Current Limitations

**Not Yet Implemented:**

- Authentication/Authorization UI
- State management (no Context API yet)
- Form submissions don't modify data
- Edit/Delete functionality
- Link to Existing Person workflow
- Multi-user support
- API integration

**Mock Data Only:**

- All data comes from `mockFamilySimple.ts`
- Changes are not persisted
- No backend connection

## File Structure

```
app/
├── layout.tsx          # Root layout
├── page.tsx            # Home page
├── tree/
│   └── page.tsx        # Tree visualization page
└── new-person/
    └── page.tsx        # Add person form page

src/
├── components/
│   ├── AddPersonForm.tsx
│   ├── FamilyTree.tsx
│   └── PersonCard.tsx
├── data/
│   └── mockFamilySimple.ts    # Mock family data
├── helpers/
│   ├── family.ts              # Family tree logic functions
│   └── tree.ts                # Tree visualization helpers
├── types/
│   └── person.ts              # Person interface
└── utils/
    └── layoutEngine.ts        # Layout calculations

components/ui/            # shadcn/ui components
```

## How Frontend Expects to Work with Backend

The frontend is designed to receive Person data as a flat array with parent IDs, then transform it:

**Expected API Response Format:**

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
  },
  {
    "id": 2,
    "firstName": "Jane",
    "lastName": "Smith",
    "gender": "female",
    "birthDate": "1952-03-20",
    "fatherId": null,
    "motherId": null
  },
  {
    "id": 3,
    "firstName": "Mike",
    "lastName": "Doe",
    "gender": "male",
    "birthDate": "1975-06-10",
    "fatherId": 1, // ID reference
    "motherId": 2 // ID reference
  }
]
```

**Frontend Transformation:**
The frontend will take this flat array and convert `fatherId`/`motherId` IDs into actual Person object references using a Map-based lookup, creating the nested structure needed for tree visualization.

**Form Submission Format:**
When creating/updating persons, forms will send:

```json
{
  "firstName": "Sarah",
  "lastName": "Doe",
  "gender": "female",
  "progenitor": false,
  "birthDate": "2000-05-15",
  "deathDate": null,
  "trivia": "Loves painting",
  "fatherId": 3, // ID, not object
  "motherId": null
}
```

Note: Frontend sends parent IDs (or null), not full Person objects.
