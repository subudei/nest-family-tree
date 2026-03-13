# How the Family Tree Renders — Node & Recursion Model

> **Purpose:** Explain exactly how the frontend builds and renders the tree so bugs like infinite recursion can be understood and prevented.

---

## 1. Data Flow: API → Rendered Tree

```
API Response (flat array)     transformToPersonObjects()      FamilyTree component
┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐
│ [                    │      │ Person objects with   │      │ Recursive rendering  │
│   { id:1, fatherId:  │ ──▶  │ .father/.mother as   │ ──▶  │ starting from        │
│     null, motherId:  │      │ object references    │      │ progenitor           │
│     null, ... },     │      │ (not IDs)            │      │                      │
│   { id:2, fatherId:  │      └──────────────────────┘      └──────────────────────┘
│     1, ... }         │
│ ]                    │
└──────────────────────┘
```

### Step 1: `transformToPersonObjects()` (helpers/family.ts)

Converts flat API data into linked objects:

```
Pass 1: Create Person objects (father: null, mother: null)
Pass 2: Link parents — person.father = personMap.get(data.fatherId)
```

**Key:** After this, `.father` and `.mother` are **direct object references**, enabling traversal like `person.father.father.mother` — but also enabling infinite loops if there's a circular parent relationship.

### Step 2: `getRootPersonFamily()` (helpers/family.ts)

Filters allPeople down to only those visible in the tree. Starting from the progenitor:

```
getRootPersonFamily(progenitor, allPeople):
  1. Add progenitor
  2. Add progenitor's spouses (found via shared children)
  3. For each biological child:
     a. Add child
     b. Add child's spouses
     c. Recurse into child's descendants
```

This produces the `treeFamily` set passed to the renderer.

### Step 3: Recursive Rendering — `FamilyPerson` component

The core recursive component. For each person:

```
FamilyPerson(person):
  1. Compute householdChildren = biological children + step-children
  2. Group children by spouse ("marriage groups")
  3. Render person's card
  4. For each marriage group:
     a. Render MarriageBlock (spouse card + connecting lines)
     b. For each child in the group:
        → Render FamilyPerson(child)  ← RECURSION
```

---

## 2. How Children Are Computed

### Biological Children

```
getChildren(person, people):
  return people.filter(p => p.father.id === person.id || p.mother.id === person.id)
```

### Step-Children

```
getStepChildren(person, people):
  1. Find spouses (people who share a biological child with person)
  2. For each spouse, get THEIR children
  3. Filter to children where person is NOT the father AND NOT the mother
```

### Household Children

```
getHouseholdChildren(person) = biological + step-children (sorted by birth year)
```

---

## 3. How Marriage Groups Work

Each person's children are grouped by the **other parent** (the spouse):

```
For person = Adam with children [Cain, Abel, Seth]:
  - Cain: father=Adam, mother=Eve  → group under Eve
  - Abel: father=Adam, mother=Eve  → group under Eve
  - Seth: father=Adam, mother=null → group under "Unknown Mother"

Result: { spouse: Eve, children: [Cain, Abel] }, { spouse: null, children: [Seth] }
```

The spouse grouping logic:
```
child.father.id === person.id  →  spouseId = child.mother.id
child.mother.id === person.id  →  spouseId = child.father.id
```

For **step-children**, the "other parent" is the child's actual biological parent (not the step-parent), so the step-child is grouped under whatever spouse brought them in.

---

## 4. The Infinite Recursion Bug (Cross-Generational Parent)

### Scenario

```
Tree before the bug:
  Progenitor (Stefan)  ─── Wife (GrandMa)
                              │
                          Son (Tihomir)

User creates: NewPerson with father=Tihomir, mother=GrandMa
```

Now GrandMa is **both**:
- Mother of Tihomir (existing)
- Mother of NewPerson (new)
- Therefore: **spouse of Tihomir** (they share child NewPerson)

### Why It Crashes

**Step 1:** `getSpouses(Tihomir)` returns `[GrandMa]` (they share child NewPerson).

**Step 2:** `getStepChildren(Tihomir)`:
- Spouse = GrandMa
- GrandMa's children = [Tihomir, other siblings, NewPerson]
- Filter: children where father ≠ Tihomir AND mother ≠ Tihomir
- **Tihomir is included as his own step-child!** (father=Stefan ≠ Tihomir, mother=GrandMa ≠ Tihomir)
- All of Tihomir's siblings are also included as step-children

**Step 3:** `getHouseholdChildren(Tihomir)` = [NewPerson, **Tihomir himself**, siblings...]

**Step 4:** Marriage group computation for Tihomir:
- For step-child "Tihomir": `child.father.id === person.id`? Stefan ≠ Tihomir → No
  → `spouseId = child.father.id = Stefan.id`
  → Stefan (Tihomir's own father!) appears as Tihomir's "spouse"

**Step 5:** `FamilyPerson(Tihomir)` renders `MarriageBlock(spouse=Stefan, children=[Tihomir, siblings])`:
- Renders `FamilyPerson(Tihomir)` as Stefan's offspring → **INFINITE RECURSION** 💥

### The Chain

```
FamilyPerson(Stefan) → child Tihomir
  └→ FamilyPerson(Tihomir) → step-child Tihomir (grouped under "spouse" Stefan)
       └→ FamilyPerson(Tihomir) → step-child Tihomir ...
            └→ FamilyPerson(Tihomir) → ...  (forever)
```

---

## 5. Two-Layer Fix Required

### Frontend (Defense): Recursion Guard

Add a `visited` set to `FamilyPerson` — if a person is already being rendered in the current ancestor chain, skip them. This prevents infinite loops from ANY data anomaly.

### Backend (Prevention): Parent Relationship Validation

When creating/updating a person, validate that **neither parent is an ancestor of the other parent**. If father is a descendant of mother (or vice versa), it means the two parents have an ancestor-descendant relationship, which breaks tree rendering.

```
Reject if: isAncestor(mother, father) || isAncestor(father, mother)

"Cannot assign parents: [Mother] is an ancestor of [Father]. 
 A person's parents cannot have an ancestor-descendant relationship."
```

---

## 6. Visual: Normal vs Broken Tree

### Normal (valid)

```
Stefan ─── GrandMa
    │
    ├── Tihomir ─── Wife
    │       │
    │       └── Child
    │
    └── Miroslav
```

### Broken (cross-generational parent)

```
Stefan ─── GrandMa         ← GrandMa is spouse of Stefan
    │          │
    ├── Tihomir ─── GrandMa  ← GrandMa ALSO spouse of her own son!
    │       │
    │       └── NewPerson
    │
    └── Miroslav

→ Tihomir becomes his own step-child → infinite recursion
```
