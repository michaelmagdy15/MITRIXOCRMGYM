# Agent Documentation Bootstrap Prompt

Copy and paste this prompt to give to any AI agent working on a new project. It will create all 6 documentation files needed for autonomous operation.

---

**PROMPT FOR AGENT:**

```
You are setting up documentation for this project. Create these 6 files that will guide AI agents working on this codebase:

## Files to create:

### 1. MASTER.md
- Project name, purpose, and current status
- Document map explaining what each doc owns
- Session bootstrap instructions (verify baseline, pick item, execute, report)
- Fast-track priority queue
- "Production ready" definition of done
- Rules of engagement summary
- End-of-session report template
- Kickoff prompt to start new agents

### 2. AGENTS.md
- Ground truth documents (read order)
- Non-negotiables (build clean, no swallowed errors, security rules)
- Engineering standards for the project's tech stack
- Landmine list (known traps specific to this project)
- Session protocol summary
- Autonomy rules with default decisions table
- Hard limits (never decide alone)

### 3. WORKFLOW.md
- Daily development loop: TRIAGE → VERIFY → PICK → EXECUTE → PROVE → RECORD → SHIP
- Phase descriptions with time estimates
- Baseline verification steps
- Item execution guidelines
- Proof requirements
- Recording requirements
- Weekly cadence suggestions
- Anti-goals (never do these)

### 4. GAPS.md
- Critical gaps section (known issues to fix)
- What's Built section (feature checklist)
- Moderate gaps (known improvements needed)
- Priority order list
- Recently fixed section

### 5. TENANTS.md (only for multi-tenant projects)
- Active tenants with domains, databases, IDs
- Reserved subdomains list
- Adding new tenant instructions
- Data isolation rules
- Branding defaults

### 6. MOBILE.md (only if mobile app exists)
- Current platform status (iOS/Android/WebView)
- App architecture explanation
- Build configuration (EAS/CI/CD)
- Build & publish commands
- App configuration files
- Known mobile-specific issues
- Troubleshooting guide

## Requirements:
- Each file must be actionable and specific to THIS project
- MASTER.md must include a kickoff prompt at the end
- AGENTS.md must include specific landmines for this codebase
- GAPS.md must list what's actually built and what's actually broken NOW
- All files must use real file paths, real feature names, real status
- Include timestamps for when each doc was created/updated
- Follow the format and structure of MitrixoGYM CRM documentation

Start by exploring the codebase to understand the project, then create each file.
```

---

## Template Structure Summary

When creating these files, each should follow this structure:

**MASTER.md:**
1. What You Are Building (1-3 sentences)
2. Current State (version, status)
3. Live Session Log (recent fixes)
4. Document Map (table)
5. Session Bootstrap (step-by-step)
6. Fast-Track Priority Queue (bullet list)
7. Production Ready Definition (checklist)
8. Rules of Engagement (summary)
9. End-of-Session Report (template)
10. Kickoff Prompt (copy-paste block)

**AGENTS.md:**
1. Ground Truth Documents (numbered list)
2. Non-Negotiables (numbered list)
3. Engineering Standards (tech-specific)
4. Landmine List (table: trap | detail)
5. Session Protocol (summary)
6. Autonomy Rules (table + hard limits)

**WORKFLOW.md:**
1. Purpose + companions
2. Core loop diagram
3. Phase 1-7 with time estimates
4. Weekly cadence table
5. Autonomy rules
6. Anti-goals checklist

**GAPS.md:**
1. Updated date header
2. Critical Gaps section
3. What's Built section (table)
4. Moderate Gaps section
5. Priority Order section
6. Recently Fixed section

**TENANTS.md (multi-tenant only):**
1. Active Tenants (table with domains, DB, ID)
2. Reserved Subdomains list
3. Adding New Tenant steps
4. Data Isolation rules
5. Branding Defaults

**MOBILE.md (mobile only):**
1. Current Status table
2. App Architecture
3. Build Configuration
4. Build & Publish commands
5. App Configuration
6. Known Issues
7. Troubleshooting
