import {
  runTransaction,
  collection,
  query,
  where,
  getDocs,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase.js';

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
 * Simulate the queue in order to compute expected barber and estimated wait time for every waiting customer.
 *
 * Rules from docs/03-flows-rules.md:
 * 1. Initial state:
 *    - Each working barber (onDuty === true && onBreak === false) is free after the remaining
 *      minutes of the customer currently in their chair (0 if none).
 *    - Barbers on break or off duty get 0 capacity and receive NO "Any" customers.
 * 2. In order of waiting customers (createdAt asc):
 *    - Customer who chose a barber: goes to that barber. Wait = that barber's free time.
 *      That barber's free time increases by the customer's duration.
 *    - Customer who chose "Any": goes to whichever working barber becomes free first.
 *      Ties broken by lowest barber `order` (or index).
 *      Wait = that barber's free time. That barber's free time increases by the customer's duration.
 * 3. All wait times are rounded up to the nearest 5 minutes (e.g. 12 min -> 15 min).
 *
 * @param {Array} queueEntries - Array of all queue entries
 * @param {Array} barbers - Array of all barber docs
 * @param {number} [currentTimeMillis=Date.now()] - Reference time for calculating remaining in-chair minutes
 * @returns {Map<string, { expectedBarber: string|null, estimatedWait: number|null }>} Map keyed by entry.id
 */
export function simulateQueueWaitTimes(queueEntries, barbers, currentTimeMillis = Date.now()) {
  const results = new Map();

  // Active working barbers (sorted by barber.order asc)
  const workingBarbers = barbers
    .filter((b) => b.onDuty === true && !b.onBreak)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  // Initialize free time map for all barbers in the system
  const barberFreeTime = {};
  for (const b of barbers) {
    barberFreeTime[b.nameEN.toLowerCase()] = 0;
  }

  // Calculate remaining in-chair minutes for each working barber
  for (const entry of queueEntries) {
    if (entry.status === STATUS.IN_CHAIR && entry.assignedBarber) {
      const barberKey = entry.assignedBarber.trim().toLowerCase();
      if (barberFreeTime[barberKey] !== undefined) {
        let remaining = Number(entry.totalDuration) || 0;
        if (entry.startedAt) {
          const startedMillis = getTimestampMillis(entry.startedAt);
          const elapsedMinutes = Math.max(0, Math.floor((currentTimeMillis - startedMillis) / (60 * 1000)));
          remaining = Math.max(0, remaining - elapsedMinutes);
        }
        barberFreeTime[barberKey] = remaining;
      }
    }
  }

  // If there are zero active working barbers, no wait times can be computed
  if (workingBarbers.length === 0) {
    for (const entry of queueEntries) {
      if (entry.status === STATUS.WAITING) {
        results.set(entry.id, {
          expectedBarber: null,
          estimatedWait: null,
        });
      }
    }
    return results;
  }

  // Sort all waiting customers in chronological order (createdAt ascending)
  const waitingEntries = queueEntries
    .filter((entry) => entry.status === STATUS.WAITING)
    .sort((a, b) => getTimestampMillis(a.createdAt) - getTimestampMillis(b.createdAt));

  for (const customer of waitingEntries) {
    const pref = (customer.barberPreference || 'any').trim().toLowerCase();
    const duration = Number(customer.totalDuration) || 0;

    let assignedBarberName = null;
    let waitMinutes = 0;

    if (pref === 'any') {
      // Find the working barber who becomes free first (ties go to lowest barber order)
      let minTime = Infinity;
      let chosenBarber = null;

      for (const barber of workingBarbers) {
        const bKey = barber.nameEN.toLowerCase();
        const freeAt = barberFreeTime[bKey] ?? 0;
        if (freeAt < minTime) {
          minTime = freeAt;
          chosenBarber = barber;
        }
      }

      if (chosenBarber) {
        assignedBarberName = chosenBarber.nameEN;
        const bKey = chosenBarber.nameEN.toLowerCase();
        waitMinutes = barberFreeTime[bKey];
        barberFreeTime[bKey] += duration;
      }
    } else {
      // Specific barber chosen
      const matchedWorkingBarber = workingBarbers.find(
        (b) => b.nameEN.toLowerCase() === pref
      );

      if (matchedWorkingBarber) {
        assignedBarberName = matchedWorkingBarber.nameEN;
        const bKey = matchedWorkingBarber.nameEN.toLowerCase();
        waitMinutes = barberFreeTime[bKey];
        barberFreeTime[bKey] += duration;
      } else {
        // Preferred barber is off duty or on break
        // Customer still waits for that specific barber, but wait time cannot be determined reliably
        const matchedDoc = barbers.find((b) => b.nameEN.toLowerCase() === pref);
        assignedBarberName = matchedDoc ? matchedDoc.nameEN : customer.barberPreference;
        waitMinutes = null;
      }
    }

    const roundedWait =
      waitMinutes === null
        ? null
        : waitMinutes === 0
        ? 0
        : Math.ceil(waitMinutes / 5) * 5;

    results.set(customer.id, {
      expectedBarber: assignedBarberName,
      estimatedWait: roundedWait,
    });
  }

  return results;
}

/**
 * Calculate estimated wait time and expected barber for a single waiting customer.
 * Wrapper around simulateQueueWaitTimes for easy use across screens.
 *
 * @param {Array} queueEntries - All queue entries
 * @param {Object} currentEntry - Customer queue entry
 * @param {Array} barbers - Array of barber docs
 * @returns {{ expectedBarber: string|null, estimatedWait: number|null }}
 */
export function calculateEstimatedWait(queueEntries, currentEntry, barbers) {
  if (!currentEntry || currentEntry.status !== STATUS.WAITING) {
    return { expectedBarber: null, estimatedWait: null };
  }

  // Ensure currentEntry is present in queue list
  const entriesWithCurrent = queueEntries.some((e) => e.id === currentEntry.id)
    ? queueEntries
    : [...queueEntries, currentEntry];

  const simulation = simulateQueueWaitTimes(entriesWithCurrent, barbers);
  const result = simulation.get(currentEntry.id);

  return result || { expectedBarber: null, estimatedWait: null };
}

/**
 * Call Next logic for a specific barber.
 * Finds the earliest 'waiting' customer who prefers this barber or 'any',
 * and assigns this barber as assignedBarber on the returned entry.
 * Exclusivity rule: Ravi's customers NEVER go to another barber.
 *
 * @param {Array} queueEntries - Array of queue entries
 * @param {string} barberName - Name of the available barber (e.g. 'Ravi')
 * @returns {Object|null} The chosen queue entry with assignedBarber set, or null
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

  if (!matched) return null;

  return {
    ...matched,
    assignedBarber: barberName,
  };
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
  }).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

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
 * Pure auto-assignment matching logic.
 * Given a list of barbers and queue entries, finds all (waitingCustomer, freeBarber) pairs
 * where a barber is currently free and has an eligible waiting customer.
 * Used by autoAssign and testable in isolation.
 *
 * @param {Array} queueEntries
 * @param {Array} barbers
 * @returns {Array<{ customer: Object, barberName: string }>}
 */
export function getAutoAssignments(queueEntries, barbers) {
  // Find which barbers currently have a customer in CALLED or IN_CHAIR
  const busyBarberNames = new Set(
    queueEntries
      .filter((e) => e.status === STATUS.CALLED || e.status === STATUS.IN_CHAIR)
      .map((e) => (e.assignedBarber || '').trim().toLowerCase())
      .filter(Boolean)
  );

  // Active working barbers who are free right now (sorted by order asc)
  const freeBarbers = barbers
    .filter((b) => {
      const nameKey = (b.nameEN || '').trim().toLowerCase();
      return b.onDuty === true && !b.onBreak && !busyBarberNames.has(nameKey);
    })
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  if (freeBarbers.length === 0) return [];

  // Sort waiting customers in chronological order
  const waitingCustomers = queueEntries
    .filter((e) => e.status === STATUS.WAITING)
    .sort((a, b) => getTimestampMillis(a.createdAt) - getTimestampMillis(b.createdAt));

  const assignedCustomerIds = new Set();
  const assignedBarberNames = new Set();
  const assignments = [];

  for (const barber of freeBarbers) {
    const barberKey = barber.nameEN.trim().toLowerCase();
    if (assignedBarberNames.has(barberKey)) continue;

    // Find the earliest waiting customer who prefers this barber or 'any'
    const candidate = waitingCustomers.find((c) => {
      if (assignedCustomerIds.has(c.id)) return false;
      const pref = (c.barberPreference || 'any').trim().toLowerCase();
      return pref === barberKey || pref === 'any';
    });

    if (candidate) {
      assignedCustomerIds.add(candidate.id);
      assignedBarberNames.add(barberKey);
      assignments.push({
        customer: candidate,
        barberName: barber.nameEN,
      });
    }
  }

  return assignments;
}

/**
 * Auto-Call rule execution via Firestore transaction.
 * Ensures concurrency safety so two clients cannot call the same customer
 * or assign two customers to the same barber.
 *
 * @param {import('firebase/firestore').Firestore} [firestoreDb=db]
 * @returns {Promise<Array<{ customerId: string, customerName: string, barberName: string }>>}
 */
export async function autoAssign(firestoreDb = db) {
  if (!firestoreDb) return [];

  try {
    // 1. Fetch current barbers and active queue docs
    const barbersSnap = await getDocs(collection(firestoreDb, 'barbers'));
    const barbers = barbersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const queueQ = query(
      collection(firestoreDb, 'queue'),
      where('status', 'in', [STATUS.WAITING, STATUS.CALLED, STATUS.IN_CHAIR])
    );
    const queueSnap = await getDocs(queueQ);
    const queueEntries = queueSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Compute intended assignments
    const assignments = getAutoAssignments(queueEntries, barbers);
    if (assignments.length === 0) return [];

    const executed = [];

    // Run transaction for each candidate assignment
    for (const item of assignments) {
      const customerDocRef = doc(firestoreDb, 'queue', item.customer.id);

      await runTransaction(firestoreDb, async (transaction) => {
        const freshSnap = await transaction.get(customerDocRef);
        if (!freshSnap.exists()) return;

        const data = freshSnap.data();
        // Concurrency guard: must still be waiting
        if (data.status !== STATUS.WAITING) return;

        transaction.update(customerDocRef, {
          status: STATUS.CALLED,
          assignedBarber: item.barberName,
          calledAt: serverTimestamp(),
        });

        executed.push({
          customerId: item.customer.id,
          customerName: data.name,
          barberName: item.barberName,
        });
      });
    }

    return executed;
  } catch (err) {
    console.error('autoAssign transaction error:', err);
    return [];
  }
}

/**
 * Check if online joining is permitted.
 * Online joining is BLOCKED if:
 * 1. Queue is manually toggled closed (queueOpen === false)
 * 2. Current time is within 30 minutes of closing time (or past it)
 *
 * @param {boolean} queueOpen - Settings flag
 * @param {string} closingTime - "HH:mm" 24h format (e.g. "00:00" for midnight)
 * @param {Date} [currentTime=new Date()]
 * @returns {{ allowed: boolean, reason: 'closed' | 'cutoff' | null, cutoffTimeStr: string }}
 */
export function isOnlineJoiningAllowed(queueOpen, closingTime = '00:00', currentTime = new Date()) {
  if (queueOpen === false) {
    return { allowed: false, reason: 'closed', cutoffTimeStr: '' };
  }

  const [closingHours, closingMinutes] = closingTime.split(':').map(Number);
  const closingDate = new Date(currentTime);
  closingDate.setHours(closingHours, closingMinutes, 0, 0);

  // Midnight is the end of the current salon day, not the start of it.
  if (closingHours === 0 && closingMinutes === 0) {
    closingDate.setDate(closingDate.getDate() + 1);
  }

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
