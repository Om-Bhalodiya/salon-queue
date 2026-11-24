/**
 * Queue Rules & State Machine Logic
 * Single source of truth for queue calculations, transitions, and validations.
 */

export const STATUS = {
  WAITING: 'waiting',
  CALLED: 'called',
  IN_CHAIR: 'in_chair',
  DONE: 'done',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
};

// Valid transitions based on docs/03-flows-rules.md
export const VALID_TRANSITIONS = {
  [STATUS.WAITING]: [STATUS.CALLED, STATUS.CANCELLED],
  [STATUS.CALLED]: [STATUS.IN_CHAIR, STATUS.NO_SHOW, STATUS.CANCELLED],
  [STATUS.IN_CHAIR]: [STATUS.DONE],
  [STATUS.DONE]: [],
  [STATUS.CANCELLED]: [],
  [STATUS.NO_SHOW]: [],
};

/**
 * Check if a state transition is allowed
 */
export function isValidTransition(fromStatus, toStatus) {
  const allowed = VALID_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

/**
 * Check if a phone number already has an active entry in the queue.
 * Active statuses: waiting, called, in_chair.
 *
 * @param {Array} queueEntries - Array of queue docs
 * @param {string} phone - 10-digit phone number
 * @returns {boolean}
 */
export function hasActiveSpot(queueEntries, phone) {
  if (!phone) return false;
  const normalizedPhone = String(phone).trim();
  const activeStatuses = [STATUS.WAITING, STATUS.CALLED, STATUS.IN_CHAIR];

  return queueEntries.some(
    (entry) =>
      String(entry.phone).trim() === normalizedPhone &&
      activeStatuses.includes(entry.status)
  );
}

/**
 * Calculate customer's 1-based position in line.
 * Counts only customers in 'waiting' status who joined before this customer.
 *
 * @param {Array} queueEntries - All queue entries
 * @param {Object} currentEntry - Customer's queue entry
 * @returns {number|null} 1-based position, or null if not waiting
 */
export function getPositionInQueue(queueEntries, currentEntry) {
  if (!currentEntry || currentEntry.status !== STATUS.WAITING) {
    return null;
  }

  const currentCreated = getTimestampMillis(currentEntry.createdAt);

  const waitingAhead = queueEntries.filter((entry) => {
    if (entry.status !== STATUS.WAITING) return false;
    const entryCreated = getTimestampMillis(entry.createdAt);
    return entryCreated < currentCreated;
  });

  return waitingAhead.length + 1;
}

/**
 * Calculate estimated wait time in minutes for a customer in waiting status.
 * Formula: totalServiceMinutesAhead / numberOfWorkingBarbers, rounded up to nearest 5 minutes.
 *
 * @param {Array} queueEntries - All queue entries
 * @param {Object} currentEntry - The customer's queue entry
 * @param {Array} barbers - Array of barber docs ({ nameEN, onDuty, onBreak })
 * @returns {number|null} Minutes (rounded up to nearest 5), or null if wait time unavailable
 */
export function calculateEstimatedWait(queueEntries, currentEntry, barbers) {
  if (!currentEntry || currentEntry.status !== STATUS.WAITING) {
    return null;
  }

  // Count active working barbers (onDuty === true && onBreak === false)
  const workingBarbersCount = barbers.filter(
    (b) => b.onDuty === true && !b.onBreak
  ).length;

  if (workingBarbersCount === 0) {
    return null; // Signals wait time unavailable
  }

  const currentCreated = getTimestampMillis(currentEntry.createdAt);

  // Sum totalDuration of all waiting entries ahead of this one
  const minutesAhead = queueEntries
    .filter((entry) => {
      if (entry.status !== STATUS.WAITING) return false;
      const entryCreated = getTimestampMillis(entry.createdAt);
      return entryCreated < currentCreated;
    })
    .reduce((sum, entry) => sum + (Number(entry.totalDuration) || 0), 0);

  // If no one is ahead, estimated wait is 0 (or next up)
  if (minutesAhead === 0) {
    return 0;
  }

  const rawEstimate = minutesAhead / workingBarbersCount;
  // Round up to nearest 5 minutes
  return Math.ceil(rawEstimate / 5) * 5;
}

/**
 * Call Next logic for a specific barber.
 * Finds the earliest 'waiting' customer who prefers this barber or 'any'.
 * Exclusivity rule: Ravi's customers NEVER go to another barber.
 *
 * @param {Array} queueEntries - Array of queue entries
 * @param {string} barberName - Name of the available barber (e.g. 'Ravi')
 * @returns {Object|null} The chosen queue entry or null
 */
export function callNextForBarber(queueEntries, barberName) {
  if (!barberName) return null;

  const targetName = barberName.trim().toLowerCase();

  const waitingSorted = [...queueEntries]
    .filter((entry) => entry.status === STATUS.WAITING)
    .sort(
      (a, b) =>
        getTimestampMillis(a.createdAt) - getTimestampMillis(b.createdAt)
    );

  const matched = waitingSorted.find((entry) => {
    const pref = (entry.barberPreference || 'any').trim().toLowerCase();
    return pref === targetName || pref === 'any';
  });

  return matched || null;
}

/**
 * Call Next floating button logic.
 * Finds an available barber (onDuty, not onBreak, and not currently serving/called),
 * then matches the earliest eligible waiting customer.
 *
 * @param {Array} queueEntries - Array of queue entries
 * @param {Array} barbers - Array of barber docs
 * @returns {{ entry: Object, barberName: string } | null}
 */
export function callNextAvailable(queueEntries, barbers) {
  // Find which barbers are currently busy (assigned to someone 'called' or 'in_chair')
  const busyBarberNames = new Set(
    queueEntries
      .filter((e) => e.status === STATUS.CALLED || e.status === STATUS.IN_CHAIR)
      .map((e) => (e.assignedBarber || '').trim().toLowerCase())
      .filter(Boolean)
  );

  // Available barbers: onDuty, not onBreak, and not currently busy
  const availableBarbers = barbers.filter((b) => {
    const nameLower = (b.nameEN || '').trim().toLowerCase();
    return (
      b.onDuty === true &&
      !b.onBreak &&
      !busyBarberNames.has(nameLower)
    );
  });

  if (availableBarbers.length === 0) {
    return null;
  }

  // Check each available barber to find an eligible waiting customer
  for (const barber of availableBarbers) {
    const candidate = callNextForBarber(queueEntries, barber.nameEN);
    if (candidate) {
      return {
        entry: candidate,
        barberName: barber.nameEN,
      };
    }
  }

  return null;
}

/**
 * Check if online joining is permitted.
 * Online joining is BLOCKED if:
 * 1. Queue is manually toggled closed (queueOpen === false)
 * 2. Current time is within 30 minutes of closing time (or past it)
 *
 * @param {boolean} queueOpen - Settings flag
 * @param {string} closingTime - "HH:mm" 24h format (e.g. "21:00")
 * @param {Date} [currentTime=new Date()]
 * @returns {{ allowed: boolean, reason: 'closed' | 'cutoff' | null, cutoffTimeStr: string }}
 */
export function isOnlineJoiningAllowed(queueOpen, closingTime = '21:00', currentTime = new Date()) {
  if (queueOpen === false) {
    return { allowed: false, reason: 'closed', cutoffTimeStr: '' };
  }

  const [closingHours, closingMinutes] = closingTime.split(':').map(Number);
  const closingDate = new Date(currentTime);
  closingDate.setHours(closingHours, closingMinutes, 0, 0);

  // Cutoff is 30 minutes before closing time
  const cutoffDate = new Date(closingDate.getTime() - 30 * 60 * 1000);

  const pad = (n) => String(n).padStart(2, '0');
  const cutoffTimeStr = `${pad(cutoffDate.getHours())}:${pad(cutoffDate.getMinutes())}`;

  if (currentTime.getTime() >= cutoffDate.getTime()) {
    return { allowed: false, reason: 'cutoff', cutoffTimeStr };
  }

  return { allowed: true, reason: null, cutoffTimeStr };
}

/**
 * Helper to convert various timestamp representations (Firestore Timestamp, Date, string, millis)
 * into numeric milliseconds for consistent sorting.
 */
function getTimestampMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  return new Date(ts).getTime() || 0;
}
