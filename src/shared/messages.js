/**
 * Inter-Component Message Bus contracts (spec Â§3).
 * Factories produce payloads matching the documented JSON contracts exactly;
 * type guards provide defensive parsing on the receiving side.
 */
import { BUS_EVENTS } from './constants.js';

/**
 * Event: Context Menu Invalidation â€” UI Layer â†’ Background Worker.
 * @param {string} source one of BUS_SOURCES
 * @returns {{ event: string, source: string, timestamp: number }}
 */
export function createReloadContextMenuMessage(source) {
  return {
    event: BUS_EVENTS.RELOAD_CONTEXT_MENU,
    source,
    timestamp: Date.now(),
  };
}

/**
 * Event: Window Lifecycle Close Capture â€” Background Worker â†’ Storage Layer / UI Layer.
 * @param {{ groupName: string, capturedAt: number, links: Array<object> }} payload
 * @returns {{ event: string, payload: { groupName: string, capturedAt: number, links: Array<object> } }}
 */
export function createSessionCapturedEvent(payload) {
  return { event: BUS_EVENTS.SESSION_CAPTURED_EVENT, payload };
}

/** @param {unknown} message @returns {boolean} */
export function isReloadContextMenuMessage(message) {
  return message !== null && typeof message === 'object'
    && /** @type {Record<string, unknown>} */ (message).event === BUS_EVENTS.RELOAD_CONTEXT_MENU;
}

/** @param {unknown} message @returns {boolean} */
export function isSessionCapturedMessage(message) {
  if (message === null || typeof message !== 'object') return false;
  const record = /** @type {Record<string, unknown>} */ (message);
  if (record.event !== BUS_EVENTS.SESSION_CAPTURED_EVENT) return false;
  const payload = record.payload;
  return payload !== null && typeof payload === 'object'
    && typeof /** @type {Record<string, unknown>} */ (payload).groupName === 'string'
    && Array.isArray(/** @type {Record<string, unknown>} */ (payload).links);
}