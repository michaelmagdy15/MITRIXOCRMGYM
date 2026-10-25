import type { Client, ClientPackage, Package, PackageBenefits, PackageHierarchy, PackageVersion } from '../types';

export interface ResolvedPackageRules {
  packageId?: string;
  packageName: string;
  packageVersion: number;
  benefitSubtitle?: string;
  hierarchy?: PackageHierarchy;
  benefits: Required<PackageBenefits>;
  freePtSessions: number;
  freezeAllowanceDays: number;
  minFreezeDays: number;
  maxFreezeDays: number;
  guestInvitations: number;
  freeClassTrials: number;
  isTimeRestricted: boolean;
  allowedStartTime?: string;
  allowedEndTime?: string;
  source: 'client_snapshot' | 'version_history' | 'client_legacy' | 'catalogue_live';
}

export function extractPackageBenefits(pkg?: Partial<Package | PackageVersion | ClientPackage> | null): Required<PackageBenefits> {
  const b = pkg?.benefits || {};
  return {
    freePtSessions: Number(pkg?.freePtSessions ?? b.freePtSessions ?? 0),
    freezeAllowanceDays: Number(pkg?.freezeAllowanceDays ?? b.freezeAllowanceDays ?? 0),
    minFreezeDays: Number(pkg?.minFreezeDays ?? b.minFreezeDays ?? 0),
    maxFreezeDays: Number(pkg?.maxFreezeDays ?? b.maxFreezeDays ?? 0),
    guestInvitations: Number(pkg?.guestInvitations ?? b.guestInvitations ?? 0),
    freeClassTrials: Number(pkg?.freeClassTrials ?? b.freeClassTrials ?? (b as any).classTrials ?? 0),
  };
}

/**
 * Determines whether an admin update to a Package alters its underlying benefits,
 * access windows, session quota, duration, or subtitle, requiring a new PackageVersion
 * so existing members retain their prior version terms.
 */
export function hasPackageBenefitsChanged(existing: Package, updates: Partial<Package>): boolean {
  const prevB = extractPackageBenefits(existing);
  const nextMerged = {
    ...existing,
    ...updates,
    benefits: {
      ...(existing.benefits || {}),
      ...(updates.benefits || {}),
    },
  };
  const nextB = extractPackageBenefits(nextMerged);

  if (
    prevB.freePtSessions !== nextB.freePtSessions ||
    prevB.freezeAllowanceDays !== nextB.freezeAllowanceDays ||
    prevB.minFreezeDays !== nextB.minFreezeDays ||
    prevB.maxFreezeDays !== nextB.maxFreezeDays ||
    prevB.guestInvitations !== nextB.guestInvitations ||
    prevB.freeClassTrials !== nextB.freeClassTrials
  ) {
    return true;
  }

  if (
    (updates.sessions !== undefined && Number(updates.sessions) !== Number(existing.sessions)) ||
    (updates.expiryDays !== undefined && Number(updates.expiryDays) !== Number(existing.expiryDays)) ||
    (updates.price !== undefined && Number(updates.price) !== Number(existing.price)) ||
    (updates.isTimeRestricted !== undefined && Boolean(updates.isTimeRestricted) !== Boolean(existing.isTimeRestricted)) ||
    (updates.allowedStartTime !== undefined && (updates.allowedStartTime || '') !== (existing.allowedStartTime || '')) ||
    (updates.allowedEndTime !== undefined && (updates.allowedEndTime || '') !== (existing.allowedEndTime || '')) ||
    (updates.benefitSubtitle !== undefined && (updates.benefitSubtitle || '') !== (existing.benefitSubtitle || ''))
  ) {
    return true;
  }

  return false;
}

/**
 * Builds an immutable PackageVersion entry from a Package state.
 */
export function createPackageVersionRecord(
  pkg: Package,
  options?: {
    version?: number;
    effectiveFrom?: string;
    effectiveUntil?: string;
    createdBy?: string;
    createdByName?: string;
    changeNotes?: string;
  }
): PackageVersion {
  const benefits = extractPackageBenefits(pkg);
  const versionNum = options?.version ?? (pkg.version && pkg.version > 0 ? pkg.version : 1);
  return {
    version: versionNum,
    packageId: pkg.id,
    name: pkg.name,
    benefitSubtitle: pkg.benefitSubtitle,
    price: Number(pkg.price || 0),
    sessions: Number(pkg.sessions || 0),
    expiryDays: Number(pkg.expiryDays || 0),
    hierarchy: pkg.hierarchy,
    benefits,
    freePtSessions: benefits.freePtSessions,
    freezeAllowanceDays: benefits.freezeAllowanceDays,
    minFreezeDays: benefits.minFreezeDays,
    maxFreezeDays: benefits.maxFreezeDays,
    guestInvitations: benefits.guestInvitations,
    freeClassTrials: benefits.freeClassTrials,
    isTimeRestricted: Boolean(pkg.isTimeRestricted),
    allowedStartTime: pkg.isTimeRestricted ? (pkg.allowedStartTime || '06:00') : undefined,
    allowedEndTime: pkg.isTimeRestricted ? (pkg.allowedEndTime || '14:00') : undefined,
    effectiveFrom: options?.effectiveFrom || pkg.updatedAt || pkg.createdAt || new Date().toISOString(),
    effectiveUntil: options?.effectiveUntil,
    createdBy: options?.createdBy || pkg.createdBy,
    createdByName: options?.createdByName || pkg.createdByName,
    changeNotes: options?.changeNotes,
  };
}

/**
 * Creates a point-in-time immutable snapshot of a catalogue Package's benefits and rules
 * to embed directly on a member's ClientPackage contract at the moment of purchase/renewal.
 */
export function buildPackageSnapshotForClient(
  pkg: Package,
  nowIso: string = new Date().toISOString()
): Partial<ClientPackage> {
  const benefits = extractPackageBenefits(pkg);
  const version = pkg.version && pkg.version > 0 ? pkg.version : 1;
  const isTimeRestricted = Boolean(pkg.isTimeRestricted || (pkg.allowedStartTime && pkg.allowedEndTime));

  return {
    packageId: pkg.id,
    packageName: pkg.name,
    packageVersion: version,
    benefitSubtitle: pkg.benefitSubtitle,
    hierarchy: pkg.hierarchy,
    benefits: {
      ...benefits,
    },
    freePtSessions: benefits.freePtSessions,
    freezeAllowanceDays: benefits.freezeAllowanceDays,
    minFreezeDays: benefits.minFreezeDays,
    maxFreezeDays: benefits.maxFreezeDays,
    guestInvitations: benefits.guestInvitations,
    freeClassTrials: benefits.freeClassTrials,
    isTimeRestricted,
    allowedStartTime: isTimeRestricted ? (pkg.allowedStartTime || '06:00') : undefined,
    allowedEndTime: isTimeRestricted ? (pkg.allowedEndTime || '14:00') : undefined,
    snapshotAt: nowIso,
  };
}

function hasExplicitSnapshotOnClientPackage(cp?: Partial<ClientPackage> | null): boolean {
  if (!cp) return false;
  if (cp.snapshotAt || (typeof cp.packageVersion === 'number' && cp.packageVersion > 0)) {
    return true;
  }
  const b = cp.benefits || {};
  return (
    cp.freePtSessions !== undefined ||
    cp.freezeAllowanceDays !== undefined ||
    cp.guestInvitations !== undefined ||
    cp.freeClassTrials !== undefined ||
    cp.isTimeRestricted !== undefined ||
    b.freePtSessions !== undefined ||
    b.freezeAllowanceDays !== undefined ||
    b.guestInvitations !== undefined ||
    b.freeClassTrials !== undefined
  );
}

/**
 * Finds the historical PackageVersion that was active when a legacy ClientPackage was purchased.
 */
export function matchHistoricalPackageVersion(
  cataloguePkg: Package | undefined,
  purchaseDateStr?: string,
  targetVersion?: number
): PackageVersion | undefined {
  if (!cataloguePkg || !Array.isArray(cataloguePkg.versionHistory) || cataloguePkg.versionHistory.length === 0) {
    return undefined;
  }

  const history = [...cataloguePkg.versionHistory].sort((a, b) => a.version - b.version);

  if (typeof targetVersion === 'number' && targetVersion > 0) {
    const exact = history.find((v) => v.version === targetVersion);
    if (exact) return exact;
  }

  if (purchaseDateStr) {
    const purchaseMs = new Date(purchaseDateStr).getTime();
    if (!isNaN(purchaseMs)) {
      for (const ver of history) {
        const fromMs = ver.effectiveFrom ? new Date(ver.effectiveFrom).getTime() : 0;
        const untilMs = ver.effectiveUntil ? new Date(ver.effectiveUntil).getTime() : Infinity;
        if (purchaseMs >= fromMs && purchaseMs <= untilMs) {
          return ver;
        }
      }
      // If purchased before the first recorded version transition, return v1 (oldest version)
      const oldest = history[0];
      if (oldest && oldest.effectiveUntil && purchaseMs <= new Date(oldest.effectiveUntil).getTime()) {
        return oldest;
      }
    }
  }

  return undefined;
}

/**
 * Resolves the effective benefits and access rules for a member's package using strict
 * Snapshot-First / Historical-Version-Second / Catalogue-Fallback-Last precedence.
 *
 * This guarantees Legacy Protection: when management modifies "Basic" for future waves,
 * existing members retain their exact original benefits and check-in rules.
 */
export function resolveEffectivePackageRules(
  clientPkg?: Partial<ClientPackage> | null,
  client?: Partial<Client> | null,
  cataloguePkg?: Package
): ResolvedPackageRules {
  const pkgName = clientPkg?.packageName || client?.packageType || cataloguePkg?.name || 'Package';

  // 1. Snapshot-First: If the member's ClientPackage has an immutable contract snapshot, honor it strictly.
  if (clientPkg && hasExplicitSnapshotOnClientPackage(clientPkg)) {
    const matchedVer = matchHistoricalPackageVersion(
      cataloguePkg,
      clientPkg.startDate || clientPkg.createdAt || client?.startDate,
      clientPkg.packageVersion
    );
    const snapB = extractPackageBenefits(clientPkg);
    const verB = matchedVer ? extractPackageBenefits(matchedVer) : null;

    // If a specific field wasn't set on a partial snapshot, fall back to the matched version
    const benefits: Required<PackageBenefits> = {
      freePtSessions: snapB.freePtSessions || verB?.freePtSessions || 0,
      freezeAllowanceDays: snapB.freezeAllowanceDays || verB?.freezeAllowanceDays || 0,
      minFreezeDays: snapB.minFreezeDays || verB?.minFreezeDays || 0,
      maxFreezeDays: snapB.maxFreezeDays || verB?.maxFreezeDays || 0,
      guestInvitations: snapB.guestInvitations || verB?.guestInvitations || 0,
      freeClassTrials: snapB.freeClassTrials || verB?.freeClassTrials || 0,
    };

    const isTimeRestricted =
      clientPkg.isTimeRestricted !== undefined
        ? Boolean(clientPkg.isTimeRestricted)
        : matchedVer?.isTimeRestricted !== undefined
        ? Boolean(matchedVer.isTimeRestricted)
        : false;

    return {
      packageId: clientPkg.packageId || cataloguePkg?.id,
      packageName: pkgName,
      packageVersion: clientPkg.packageVersion || matchedVer?.version || 1,
      benefitSubtitle: clientPkg.benefitSubtitle ?? matchedVer?.benefitSubtitle,
      hierarchy: clientPkg.hierarchy ?? matchedVer?.hierarchy ?? cataloguePkg?.hierarchy,
      benefits,
      ...benefits,
      isTimeRestricted,
      allowedStartTime: isTimeRestricted
        ? (clientPkg.allowedStartTime || matchedVer?.allowedStartTime || '06:00')
        : undefined,
      allowedEndTime: isTimeRestricted
        ? (clientPkg.allowedEndTime || matchedVer?.allowedEndTime || '14:00')
        : undefined,
      source: 'client_snapshot',
    };
  }

  // 2. Historical Version Match: For pre-snapshot members, match their startDate against cataloguePkg.versionHistory
  const purchaseDate = clientPkg?.startDate || clientPkg?.createdAt || client?.startDate || client?.createdAt;
  const historicalVer = matchHistoricalPackageVersion(cataloguePkg, purchaseDate, clientPkg?.packageVersion);
  if (historicalVer) {
    const benefits = extractPackageBenefits(historicalVer);
    const isTimeRestricted = Boolean(
      historicalVer.isTimeRestricted || (historicalVer.allowedStartTime && historicalVer.allowedEndTime)
    );
    return {
      packageId: historicalVer.packageId || cataloguePkg?.id,
      packageName: pkgName,
      packageVersion: historicalVer.version,
      benefitSubtitle: historicalVer.benefitSubtitle,
      hierarchy: historicalVer.hierarchy ?? cataloguePkg?.hierarchy,
      benefits,
      ...benefits,
      isTimeRestricted,
      allowedStartTime: isTimeRestricted ? (historicalVer.allowedStartTime || '06:00') : undefined,
      allowedEndTime: isTimeRestricted ? (historicalVer.allowedEndTime || '14:00') : undefined,
      source: 'version_history',
    };
  }

  // 3. Legacy Member-Level Balances (if present directly on Client doc)
  const rawClient = (client || {}) as any;
  const clientBenefits = rawClient.benefits || {};
  const hasClientLevelBenefits =
    rawClient.freezeAllowanceDays !== undefined ||
    rawClient.freePtSessions !== undefined ||
    rawClient.guestInvitations !== undefined ||
    clientBenefits.freezeAllowanceDays !== undefined ||
    clientBenefits.freePtSessions !== undefined ||
    clientBenefits.guestInvitations !== undefined;

  if (hasClientLevelBenefits && !cataloguePkg) {
    const benefits = extractPackageBenefits(rawClient);
    return {
      packageName: pkgName,
      packageVersion: 1,
      benefits,
      ...benefits,
      isTimeRestricted: false,
      source: 'client_legacy',
    };
  }

  // 4. Fallback to Live Catalogue Package
  const catBenefits = extractPackageBenefits(cataloguePkg);
  const isTimeRestricted = Boolean(
    cataloguePkg?.isTimeRestricted || (cataloguePkg?.allowedStartTime && cataloguePkg?.allowedEndTime)
  );
  return {
    packageId: cataloguePkg?.id,
    packageName: pkgName,
    packageVersion: cataloguePkg?.version || 1,
    benefitSubtitle: cataloguePkg?.benefitSubtitle,
    hierarchy: cataloguePkg?.hierarchy,
    benefits: catBenefits,
    ...catBenefits,
    isTimeRestricted,
    allowedStartTime: isTimeRestricted ? (cataloguePkg?.allowedStartTime || '06:00') : undefined,
    allowedEndTime: isTimeRestricted ? (cataloguePkg?.allowedEndTime || '14:00') : undefined,
    source: 'catalogue_live',
  };
}
