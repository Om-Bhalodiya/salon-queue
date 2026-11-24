import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

const SESSION_PREFIX = 'salon_auth_';

// Default PIN fallbacks for initial login or offline fallback
export const DEFAULT_PINS = {
  reception: '1111',
  barber: '2222',
  owner: '3333',
};

/**
 * Check if the user is already authenticated for a specific role in this browser session.
 * @param {'reception' | 'barber' | 'owner'} role
 * @returns {boolean}
 */
export function isRoleAuthenticated(role) {
  try {
    return sessionStorage.getItem(`${SESSION_PREFIX}${role}`) === 'true';
  } catch (err) {
    return false;
  }
}

/**
 * Mark a role as authenticated in the current browser session.
 * @param {'reception' | 'barber' | 'owner'} role
 */
export function setRoleAuthenticated(role) {
  try {
    sessionStorage.setItem(`${SESSION_PREFIX}${role}`, 'true');
  } catch (err) {
    console.error('Failed to set sessionStorage auth', err);
  }
}

/**
 * Clear authentication for a role (e.g. on lock button tap).
 * @param {'reception' | 'barber' | 'owner'} role
 */
export function clearRoleAuth(role) {
  try {
    sessionStorage.removeItem(`${SESSION_PREFIX}${role}`);
  } catch (err) {
    console.error('Failed to clear sessionStorage auth', err);
  }
}

/**
 * Fetch the latest configured PINs from Firestore config/pins.
 * Falls back to DEFAULT_PINS if document doesn't exist.
 * @returns {Promise<{reception: string, barber: string, owner: string}>}
 */
export async function getStoredPins() {
  try {
    const pinsRef = doc(db, 'config', 'pins');
    const snap = await getDoc(pinsRef);
    if (snap.exists()) {
      return { ...DEFAULT_PINS, ...snap.data() };
    }
  } catch (err) {
    console.warn('Could not read PINs from Firestore, falling back to defaults:', err.message);
  }
  return DEFAULT_PINS;
}

/**
 * Verify a submitted PIN for a given role.
 * Plain-text comparison as per user requirements for the lab demo.
 *
 * @param {'reception' | 'barber' | 'owner'} role
 * @param {string} inputPin
 * @returns {Promise<boolean>}
 */
export async function verifyPin(role, inputPin) {
  if (!inputPin) return false;
  const pins = await getStoredPins();
  const expectedPin = String(pins[role] ?? DEFAULT_PINS[role]).trim();
  const isValid = String(inputPin).trim() === expectedPin;

  if (isValid) {
    setRoleAuthenticated(role);
  }

  return isValid;
}

/**
 * Save new PINs to Firestore config/pins.
 * @param {{ reception?: string, barber?: string, owner?: string }} newPins
 */
export async function updatePins(newPins) {
  const pinsRef = doc(db, 'config', 'pins');
  await setDoc(pinsRef, newPins, { merge: true });
}
