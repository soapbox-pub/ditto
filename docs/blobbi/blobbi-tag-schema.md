# Blobbi Tag Schema

> **Product Specification** - This document is the canonical source of truth for Blobbi tag definitions.  
> The runtime schema at `src/lib/blobbi-tag-schema.ts` MUST align with this spec.

## Overview

Blobbi events (Kind 31124) use tags to store all state data. This document defines:
- All valid tags and their purposes
- Which tags are required vs optional
- Which tags persist across stage transitions
- Which tags should be removed during transitions
- Deprecated tags that should be filtered out

---

## Tag Categories

### 1. System / Metadata Tags

Core protocol-level tags required for event identification and ecosystem membership.

| Tag | Required | Stages | Persistent | Source | Format | Description |
|-----|----------|--------|------------|--------|--------|-------------|
| `d` | **Yes** | egg, baby, adult | Yes | system | `blobbi-{pubkeyPrefix12}-{petId10}` | Unique identifier (addressable event d-tag) |
| `b` | **Yes** | egg, baby, adult | Yes | system | `blobbi:ecosystem:v1` | Ecosystem namespace identifier |
| `t` | **Yes** | egg, baby, adult | Yes | system | `blobbi` | Topic tag for discoverability |
| `client` | No | egg, baby, adult | Yes | system | `blobbi` | Client identifier |

### 2. Core Identity Tags

Tags that define the Blobbi's unique identity. These MUST be preserved across all transitions.

| Tag | Required | Stages | Persistent | Source | Format | Description |
|-----|----------|--------|------------|--------|--------|-------------|
| `name` | **Yes** | egg, baby, adult | Yes | user | string | Display name (set during adoption) |
| `seed` | **Yes** | egg, baby, adult | Yes | system | 64 hex chars | Deterministic seed for visual traits |
| `generation` | No | egg, baby, adult | Yes | system | positive integer | Lineage generation (default: 1) |

**Important**: The `seed` is derived once at creation using `sha256("blobbi:v1|{pubkey}:{d}:{createdAt}")` and MUST NEVER be recomputed.

### 3. Visual Trait Tags

Tags derived deterministically from the seed. These are stored explicitly for fast rendering and compatibility.

| Tag | Required | Stages | Persistent | Source | Format | Description |
|-----|----------|--------|------------|--------|--------|-------------|
| `base_color` | No | egg, baby, adult | Yes | generated | CSS hex (e.g., `#F59E0B`) | Primary color |
| `secondary_color` | No | egg, baby, adult | Yes | generated | CSS hex | Secondary/accent color |
| `eye_color` | No | egg, baby, adult | Yes | generated | CSS hex | Eye color |
| `pattern` | No | egg, baby, adult | Yes | generated | `solid\|spotted\|striped\|gradient` | Visual pattern type |
| `special_mark` | No | egg, baby, adult | Yes | generated | `none\|star\|heart\|sparkle\|blush` | Special decoration |
| `size` | No | egg, baby, adult | Yes | generated | `small\|medium\|large` | Size category |

**Regenerable**: These tags CAN be regenerated from the seed if missing. However, they should be preserved when present.

### 4. Personality / Trait Tags

Character traits that define the Blobbi's personality. These are generated at creation and MUST persist.

| Tag | Required | Stages | Persistent | Source | Format | Description |
|-----|----------|--------|------------|--------|--------|-------------|
| `personality` | No | egg, baby, adult | Yes | generated | string | Core personality type |
| `trait` | No | egg, baby, adult | Yes | generated | string | Character trait modifier |
| `favorite_food` | No | egg, baby, adult | Yes | generated | string | Preferred food type |
| `voice_type` | No | egg, baby, adult | Yes | generated | string | Voice characteristic |
| `mood` | No | egg, baby, adult | Yes | computed | string | Current emotional state |

**Not Regenerable**: These tags are generated once and MUST be preserved. Do NOT invent values for existing Blobbis that lack these tags.

### 5. Stat Tags

Numeric values representing the Blobbi's current condition. These are actively computed and change frequently.

| Tag | Required | Stages | Persistent | Source | Format | Default | Description |
|-----|----------|--------|------------|--------|--------|---------|-------------|
| `hunger` | No | egg, baby, adult | No | computed | 1-100 | 100 | Fullness level |
| `happiness` | No | egg, baby, adult | No | computed | 1-100 | 100 | Happiness level |
| `health` | No | egg, baby, adult | No | computed | 1-100 | 100 | Health level |
| `hygiene` | No | egg, baby, adult | No | computed | 1-100 | 100 | Cleanliness level |
| `energy` | No | egg, baby, adult | No | computed | 1-100 | 100 | Energy level |

**Stage Transition Behavior**:
- **Hatch (egg → baby)**: `health` inherited from egg, others reset to 100
- **Evolve (baby → adult)**: All stats inherited from baby (after decay)

### 6. State / Lifecycle Tags

Tags that track the Blobbi's current lifecycle state.

| Tag | Required | Stages | Persistent | Source | Format | Description |
|-----|----------|--------|------------|--------|--------|-------------|
| `stage` | **Yes** | egg, baby, adult | No | system | `egg\|baby\|adult` | Current lifecycle stage |
| `state` | **Yes** | egg, baby, adult | No | system | `active\|sleeping\|hibernating\|incubating\|evolving` | Activity state |
| `last_interaction` | **Yes** | egg, baby, adult | No | system | Unix timestamp | Last user action |
| `last_decay_at` | No | egg, baby, adult | No | system | Unix timestamp | Decay checkpoint |

**State Constraints**:
- `incubating` is only valid for `stage: egg`
- `evolving` is only valid for `stage: baby`
- After hatch/evolve completes, `state` MUST be set to `active`

### 7. Task System Tags

Temporary tags used during incubation and evolution processes. These are REMOVED after stage transitions.

| Tag | Required | Stages | Persistent | Source | Format | Description |
|-----|----------|--------|------------|--------|--------|-------------|
| `state_started_at` | No | egg, baby | No | system | Unix timestamp | When incubating/evolving started |
| `task` | No | egg, baby | No | computed | `["task", "name:value"]` | Task progress (multiple allowed) |
| `task_completed` | No | egg, baby | No | computed | `["task_completed", "name"]` | Completed tasks (multiple allowed) |

**Transition Behavior**: ALL task system tags MUST be removed when hatch or evolve completes.

### 8. Progression Tags

Long-term progress tracking that persists across all stages.

| Tag | Required | Stages | Persistent | Source | Format | Default | Description |
|-----|----------|--------|------------|--------|--------|---------|-------------|
| `experience` | No | egg, baby, adult | Yes | computed | non-negative int | 0 | Total XP |
| `care_streak` | No | egg, baby, adult | Yes | computed | non-negative int | 0 | Consecutive care days |

### 9. Social / Flag Tags

User preferences and computed flags.

| Tag | Required | Stages | Persistent | Source | Format | Default | Description |
|-----|----------|--------|------------|--------|--------|---------|-------------|
| `breeding_ready` | No | egg, baby, adult | Yes | computed | `true\|false` | false | Breeding eligibility |

### 10. Evolution Tags

Tags specific to adult Blobbis.

| Tag | Required | Stages | Persistent | Source | Format | Description |
|-----|----------|--------|------------|--------|--------|-------------|
| `adult_type` | No | adult | Yes | computed | string | Evolution form type |

### 11. Extension Tags

Optional tags for themes and crossover features.

| Tag | Required | Stages | Persistent | Source | Format | Description |
|-----|----------|--------|------------|--------|--------|-------------|
| `theme` | No | egg, baby, adult | Yes | system | string (e.g., `divine`) | Theme variant |
| `crossover_app` | No | egg, baby, adult | Yes | system | string (e.g., `divine`) | Crossover app identifier |

---

## Deprecated Tags

These tags are from legacy versions and MUST be removed when republishing events.

| Tag | Reason | Replaced By |
|-----|--------|-------------|
| `shell_integrity` | Eggs use standard `health` stat | `health` |
| `egg_temperature` | Warmth handled via UI props | N/A |
| `incubation_progress` | Replaced by task system | `task`, `task_completed` |
| `egg_status` | Replaced by standard state | `state` |
| `fees` | Removed | N/A |
| `incubation_time` | Uses state_started_at | `state_started_at` |
| `start_incubation` | Uses state_started_at | `state_started_at` |
| `interact_6_progress` | Legacy interaction tracking | `["task", "interactions:N"]` |

---

## Stage Transition Rules

### Hatch (egg → baby)

**Tags to REMOVE**:
- `task`
- `task_completed`
- `state_started_at`

**Tags to UPDATE**:
- `stage` → `baby`
- `state` → `active`
- `hunger` → `100`
- `happiness` → `100`
- `hygiene` → `100`
- `energy` → `100`
- `health` → (inherited from egg after decay)
- `last_interaction` → current timestamp
- `last_decay_at` → current timestamp

**Tags to PRESERVE (all persistent tags)**:
- All system tags (`d`, `b`, `t`, `client`)
- All identity tags (`name`, `seed`, `generation`)
- All visual tags (colors, pattern, size)
- All personality tags (if present)
- All progression tags (`experience`, `care_streak`)
- All social tags (`breeding_ready`)
- All extension tags (`theme`, `crossover_app`)

### Evolve (baby → adult)

**Tags to REMOVE**:
- `task`
- `task_completed`
- `state_started_at`

**Tags to UPDATE**:
- `stage` → `adult`
- `state` → `active`
- All stats → (inherited from baby after decay)
- `last_interaction` → current timestamp
- `last_decay_at` → current timestamp

**Tags to PRESERVE (all persistent tags)**:
- Same as hatch, plus all stats are inherited (not reset)

**Tags to ADD (optional)**:
- `adult_type` → computed based on care history

---

## Migration Rules

When migrating legacy Blobbis to canonical format:

1. **Always preserve existing values** - Do not regenerate tags that already exist
2. **Generate missing required tags** - Derive `seed` if missing using the legacy event's `created_at`
3. **Remove deprecated tags** - Filter out all tags in the deprecated list
4. **Repair visual tags** - Regenerate from seed if missing (these are regenerable)
5. **Do NOT invent personality tags** - If `personality`, `trait`, etc. don't exist, leave them empty

---

## Validation Rules

A valid Blobbi event MUST have:
- `d` tag in canonical format
- `b` tag = `blobbi:ecosystem:v1`
- `t` tag = `blobbi`
- `name` tag (non-empty)
- `seed` tag (64 hex chars)
- `stage` tag (valid value)
- `state` tag (valid value)
- `last_interaction` tag (valid timestamp)

---

## Implementation Checklist

When implementing any flow that modifies Blobbi tags:

- [ ] Start from `canonical.allTags` as the base
- [ ] Remove only task-specific tags (`task`, `task_completed`, `state_started_at`)
- [ ] Preserve ALL persistent tags (identity, visual, personality, progression, social, extension)
- [ ] Filter out deprecated tags
- [ ] Update only the tags that need to change
- [ ] Validate required tags are present
