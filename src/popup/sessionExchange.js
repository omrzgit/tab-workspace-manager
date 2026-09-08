/**
 * Export/Import Subsystem (UI View Layer boundary of the External Remote
 * Storage Layer). Handles offline JSON file exports named
 * `TabGroup_{EPOCH_TIMESTAMP}.json` and the JSON Import Merge flow.
 */
import { buildExportDocument, parseExportDocument } from '../shared/schemas.js';
import { resolveGroupNameConflict, sanitizeLink, sanitizeGroup } from '../shared/sanitize.js';

/**
 * Serializes groups to the Export Document contract and triggers the
 * browser download with the documented naming structure.
 * @param {Array<{ name: string, links: Array<object>, order: number }>} groups
 */
export function exportGroupsToFile(groups) {
  const exportDoc = buildExportDocument(groups);
  const blob = new Blob([JSON.stringify(exportDoc, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `TabGroup_${Date.now()}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Flow 3: JSON Import Merge.
 * Parses the uploaded stream, validates against the data contract (corrupt
 * payloads halt here â€” no writes), drops unsafe URIs, eliminates groups with
 * zero valid links, resolves name collisions deterministically, and returns
 * the merged, re-indexed dataset ready for commit.
 *
 * @param {string} rawText uploaded JSON stream
 * @param {Array<{ name: string, links: Array<object>, order: number }>} existing current dataset
 * @returns {Array<{ name: string, links: Array<object>, order: number }>} merged dataset
 */
export function mergeImportedGroups(rawText, existing) {
  let document;
  try {
    document = JSON.parse(rawText);
  } catch {
    throw new Error('Malformed import: file is not valid JSON.');
  }

  const incoming = parseExportDocument(document); // throws SchemaViolationError on contract breach

  const existingNames = new Set(existing.map((group) => group.name));
  const merged = existing.map((group) => ({ ...group, links: [...group.links] }));

  for (const candidate of incoming) {
    // Sanitize the link collection against the protocol whitelist.
    const safeLinks = [];
    for (const candidateLink of candidate.links) {
      const safe = sanitizeLink(candidateLink, safeLinks.length);
      if (safe) safeLinks.push(safe);
    }
    if (safeLinks.length === 0) continue; // zero valid links â‡’ group eliminated

    const resolvedName = resolveGroupNameConflict(candidate.name, existingNames);
    existingNames.add(resolvedName);
    merged.push({ name: resolvedName, links: safeLinks, order: merged.length });
  }

  // Re-index absolute ordering across sibling groups.
  return merged
    .map((group, index) => sanitizeGroup(group, index))
    .filter((group) => group !== null);
}