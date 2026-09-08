/**
 * Security sanitization layer (spec Â§4, "Edge-Case Handling & Boundary Safeguards").
 * Pure functions â€” no browser API access â€” so they are unit-testable in Node.
 */
import {
  ALLOWED_LINK_SCHEMES,
  CONFLICT_SUFFIX,
  LIMITS,
} from './constants.js';

/**
 * @param {unknown} raw
 * @returns {boolean} true when the URI carries an approved protocol scheme.
 */
export function isAllowedLinkUri(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return false;
  try {
    const { protocol } = new URL(raw);
    return ALLOWED_LINK_SCHEMES.includes(protocol.slice(0, -1));
  } catch {
    return false;
  }
}

/**
 * Image icons are strictly restricted to HTTP(S) or valid data:image/* signatures.
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isAllowedIconUri(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return false;
  if (/^data:image\//i.test(raw)) return true;
  try {
    const { protocol } = new URL(raw);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Extracts the approved scheme of a URI, or null. @returns {string|null} */
export function extractScheme(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const scheme = new URL(raw).protocol.slice(0, -1);
    return ALLOWED_LINK_SCHEMES.includes(scheme) ? scheme : null;
  } catch {
    return null;
  }
}

/**
 * Validates + sanitizes a candidate Link Record. Returns null when unsafe.
 * @param {unknown} candidate
 * @param {number} order zero-based index assigned by the caller
 * @returns {{ id?: string|number, name: string, link: string, icon?: string, order: number } | null}
 */
export function sanitizeLink(candidate, order) {
  if (candidate === null || typeof candidate !== 'object') return null;
  const { id, name, link, icon } = /** @type {Record<string, unknown>} */ (candidate);

  if (typeof name !== 'string' || name.trim().length === 0) return null;
  if (!isAllowedLinkUri(link)) return null;

  const record = /** @type {*} */ ({
    name: name.slice(0, LIMITS.LINK_NAME_MAX),
    link,
    order,
  });
  if (id !== undefined && id !== null && (typeof id === 'string' || typeof id === 'number')) {
    record.id = id;
  }
  if (typeof icon === 'string' && icon.length > 0 && isAllowedIconUri(icon)) {
    record.icon = icon;
  }
  return record;
}

/**
 * Validates + sanitizes a candidate SavedGroup Record.
 * Groups left with zero valid links are eliminated (returns null).
 * @param {unknown} candidate
 * @param {number} order
 * @returns {{ name: string, links: Array<object>, order: number } | null}
 */
export function sanitizeGroup(candidate, order) {
  if (candidate === null || typeof candidate !== 'object') return null;
  const { name, links } = /** @type {Record<string, unknown>} */ (candidate);

  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (trimmed.length < LIMITS.GROUP_NAME_MIN || trimmed.length > LIMITS.GROUP_NAME_MAX) return null;
  if (!Array.isArray(links)) return null;

  const safeLinks = [];
  for (const candidateLink of links) {
    const safe = sanitizeLink(candidateLink, safeLinks.length);
    if (safe) safeLinks.push(safe);
  }
  if (safeLinks.length === 0) return null; // zero valid links â‡’ group eliminated

  return { name: trimmed, links: safeLinks, order };
}

/**
 * Re-indexes and sanitizes an entire dataset for persistence (used by the
 * migration layer and every write path). Preserves declared `order` when
 * present, otherwise assigns the array position.
 * @param {unknown[]} rawGroups
 * @returns {Array<{ name: string, links: Array<object>, order: number }>}
 */
export function normalizeGroups(rawGroups) {
  if (!Array.isArray(rawGroups)) return [];
  const normalized = [];
  for (const raw of rawGroups) {
    const declaredOrder = raw && typeof raw === 'object'
      && Number.isInteger(/** @type {*} */ (raw).order)
      ? /** @type {*} */ (raw).order
      : normalized.length;
    const group = sanitizeGroup(raw, declaredOrder);
    if (group) normalized.push(group);
  }
  return normalized;
}

/**
 * Deterministic name-conflict resolver (spec Flow 3.5):
 * remaps to `{groupName}_imported_{N}` until unique.
 * @param {string} desiredName
 * @param {ReadonlySet<string>} existingNames
 * @returns {string}
 */
export function resolveGroupNameConflict(desiredName, existingNames) {
  if (!existingNames.has(desiredName)) return desiredName;
  let n = 1;
  let candidate = `${desiredName}${CONFLICT_SUFFIX}${n}`;
  while (existingNames.has(candidate)) {
    n += 1;
    candidate = `${desiredName}${CONFLICT_SUFFIX}${n}`;
  }
  return candidate;
}