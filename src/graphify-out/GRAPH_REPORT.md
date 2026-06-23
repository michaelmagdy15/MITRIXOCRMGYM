# Graph Report - src  (2026-06-24)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 523 nodes · 1563 edges · 32 communities (26 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cf1d7036`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 67 edges
2. `db` - 53 edges
3. `useAppContext()` - 50 edges
4. `Client` - 50 edges
5. `useLanguage()` - 43 edges
6. `addAuditLog()` - 32 edges
7. `useSettings()` - 31 edges
8. `cleanData()` - 27 edges
9. `User` - 24 edges
10. `AppContextType` - 21 edges

## Surprising Connections (you probably didn't know these)
- `ClubOperations()` --calls--> `useSettings()`  [EXTRACTED]
  ClubOperations.tsx → contexts/SettingsContext.tsx
- `PaginatedList()` --calls--> `useLanguage()`  [EXTRACTED]
  Dashboard.tsx → contexts/LanguageContext.tsx
- `CoachHome()` --calls--> `useAuth()`  [EXTRACTED]
  coach/CoachHome.tsx → contexts/AuthContext.tsx
- `CoachSchedule()` --calls--> `useAuth()`  [EXTRACTED]
  coach/CoachSchedule.tsx → contexts/AuthContext.tsx
- `CoachSessions()` --calls--> `useAuth()`  [EXTRACTED]
  coach/CoachSessions.tsx → contexts/AuthContext.tsx

## Import Cycles
- None detected.

## Communities (32 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (51): ActivityItem, BadgeConfig, RewardItem, AlertDialog(), AlertDialogProps, AppContext, AppContextType, app (+43 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (45): AdminHub(), Language, LanguageContext, LanguageContextType, LanguageProvider(), useLanguage(), SettingsContext, SettingsProvider() (+37 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (42): CalendarView(), GymClass, Clients(), Coaches(), CommissionReport(), ConfirmDialog(), ConfirmDialogProps, RenewalPipeline() (+34 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (19): QUOTE_GENERATOR_EMAILS, CoachClients(), ErrorBoundary, Props, State, OfflineBanner(), QRCodePage(), AuthProvider() (+11 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (22): MatchResult, ResyncAssignmentsProps, canonicalize(), RepairItem, resolveRepUser(), ResyncPaymentsProps, WhatsAppDialogProps, GuestPortalProps (+14 more)

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (16): DEFAULT_REWARDS, Redemption, Reward, BadgeDefinition, CoinsTransaction, CoinsWallet, creditCoins(), DEFAULT_BADGES (+8 more)

### Community 6 - "Community 6"
Cohesion: 0.15
Nodes (16): AdminStorefrontManager(), storage, ActivityLevel, ClientDocument, ClientStatus, Comment, FitnessTarget, HeroSlide (+8 more)

### Community 7 - "Community 7"
Cohesion: 0.26
Nodes (13): AdminPointsManager(), MemberWallet(), creditPoints(), debitPoints(), getActiveBundles(), getAllBundles(), getOrCreateWallet(), getTransactionHistory() (+5 more)

### Community 8 - "Community 8"
Cohesion: 0.24
Nodes (13): CRMContext, CRMContextType, AuditLog, ClientId, ClientUpdates, ImportBatch, ImportBatchId, PackageId (+5 more)

### Community 9 - "Community 9"
Cohesion: 0.17
Nodes (10): SettingsContextType, mockClients, mockSalesTarget, mockUsers, now, BrandingSettings, FeatureFlags, SalesTarget (+2 more)

### Community 10 - "Community 10"
Cohesion: 0.18
Nodes (7): BRANCHES, ClubOperations(), STATUS_STYLES, GuestInvite, JuiceBarOrder, Locker, LockerRequest

### Community 11 - "Community 11"
Cohesion: 0.17
Nodes (9): CoachHome(), CoachStats, CoachTab, CoachPortal(), CoachTab, NAV_ITEMS, CoachSessions(), STATUS_STYLES (+1 more)

### Community 12 - "Community 12"
Cohesion: 0.24
Nodes (8): CoachProfile(), OnlineUsers(), UserPerformanceDialog(), useAuth(), CRMProvider(), QUOTE_GENERATOR_ALLOWED_EMAILS, QuoteGenerator(), Users()

### Community 13 - "Community 13"
Cohesion: 0.25
Nodes (9): Attendance(), ConversionFunnel(), ConversionFunnelProps, STAGES, AppProvider(), useAttendance(), useClients(), usePTSessions() (+1 more)

### Community 14 - "Community 14"
Cohesion: 0.20
Nodes (6): KPICard(), KPICardProps, cn(), ColumnMapperProps, FileUploader(), FileUploaderProps

### Community 15 - "Community 15"
Cohesion: 0.25
Nodes (3): AuditLogs(), OWNER_EMAILS, useAuditLogs()

### Community 16 - "Community 16"
Cohesion: 0.44
Nodes (5): ForcePasswordChangeDialog(), MyProfile(), getPasswordStrength(), PasswordStrengthResult, validateNewPassword()

### Community 17 - "Community 17"
Cohesion: 0.25
Nodes (5): addPackage(), addTask(), updatePackage(), updatePrivateSession(), updateTask()

### Community 19 - "Community 19"
Cohesion: 0.29
Nodes (5): AuthContext, logOut(), signInWithEmail(), isAdmin(), isSuperAdmin()

### Community 20 - "Community 20"
Cohesion: 0.40
Nodes (5): AppNotification, NotificationCenter(), NotificationType, useTasks(), Tasks()

### Community 21 - "Community 21"
Cohesion: 0.40
Nodes (4): CoachSchedule(), DAYS, DEFAULT_SCHEDULE, CoachSchedule

### Community 22 - "Community 22"
Cohesion: 0.40
Nodes (4): MemberNotification, MemberNotificationBell(), MemberNotificationBellProps, typeIcons

### Community 24 - "Community 24"
Cohesion: 0.50
Nodes (4): AuthContextType, PasswordResetRequest, PendingAccount, UserId

## Knowledge Gaps
- **94 isolated node(s):** `OWNER_EMAILS`, `GymClass`, `BRANCHES`, `PRIVATE_PACKAGES`, `GROUP_PACKAGES` (+89 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useAuth()` connect `Community 12` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 6`, `Community 8`, `Community 11`, `Community 13`, `Community 15`, `Community 16`, `Community 19`, `Community 20`, `Community 21`, `Community 22`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `db` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 7`, `Community 8`, `Community 10`, `Community 11`, `Community 12`, `Community 15`, `Community 17`, `Community 19`, `Community 21`, `Community 22`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `useLanguage()` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`, `Community 4`, `Community 6`, `Community 7`, `Community 13`, `Community 20`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **What connects `OWNER_EMAILS`, `GymClass`, `BRANCHES` to the rest of the system?**
  _94 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07949412827461608 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05794556628621598 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06826923076923076 - nodes in this community are weakly interconnected._