import {
  STATUS,
  isValidTransition,
  hasActiveSpot,
  getPositionInQueue,
  calculateEstimatedWait,
  callNextForBarber,
  callNextAvailable,
  isOnlineJoiningAllowed,
} from '../src/lib/queueRules.js';

console.log('--- Testing queueRules.js ---');

// Test 1: State machine transitions
console.assert(isValidTransition(STATUS.WAITING, STATUS.CALLED) === true, 'T1 failed');
console.assert(isValidTransition(STATUS.CALLED, STATUS.WAITING) === false, 'T1 backwards transition allowed!');
console.assert(isValidTransition(STATUS.CALLED, STATUS.IN_CHAIR) === true, 'T1 in_chair failed');
console.assert(isValidTransition(STATUS.IN_CHAIR, STATUS.DONE) === true, 'T1 done failed');
console.assert(isValidTransition(STATUS.DONE, STATUS.WAITING) === false, 'T1 done backwards failed');
console.log('✔ State machine transitions passed');

// Test 2: Active phone spot detection
const sampleQueue = [
  { id: '1', name: 'Alice', phone: '9876543210', status: STATUS.WAITING, createdAt: 1000, totalDuration: 30, barberPreference: 'Ravi' },
  { id: '2', name: 'Bob', phone: '9998887776', status: STATUS.DONE, createdAt: 2000, totalDuration: 15, barberPreference: 'any' },
];
console.assert(hasActiveSpot(sampleQueue, '9876543210') === true, 'T2 Alice active spot not detected');
console.assert(hasActiveSpot(sampleQueue, '9998887776') === false, 'T2 Bob is done, should not count as active');
console.assert(hasActiveSpot(sampleQueue, '1112223334') === false, 'T2 New phone should be allowed');
console.log('✔ Active phone check passed');

// Test 3: Position in queue
const queueForPos = [
  { id: '1', status: STATUS.WAITING, createdAt: 1000 },
  { id: '2', status: STATUS.WAITING, createdAt: 2000 },
  { id: '3', status: STATUS.WAITING, createdAt: 3000 },
];
console.assert(getPositionInQueue(queueForPos, queueForPos[0]) === 1, 'T3 pos 1 failed');
console.assert(getPositionInQueue(queueForPos, queueForPos[2]) === 3, 'T3 pos 3 failed');
console.log('✔ Queue position calculation passed');

// Test 4: Wait time calculation (total minutes ahead / working barbers, rounded up to 5)
const barbers = [
  { nameEN: 'Ravi', onDuty: true, onBreak: false },
  { nameEN: 'Amit', onDuty: true, onBreak: false },
];
const queueForWait = [
  { id: '1', status: STATUS.WAITING, createdAt: 1000, totalDuration: 30 },
  { id: '2', status: STATUS.WAITING, createdAt: 2000, totalDuration: 30 },
  { id: '3', status: STATUS.WAITING, createdAt: 3000, totalDuration: 30 },
];
// For customer #3, customers #1 and #2 are ahead (30 + 30 = 60 min). 60 / 2 barbers = 30 min.
const estWait = calculateEstimatedWait(queueForWait, queueForWait[2], barbers);
console.assert(estWait === 30, `T4 expected 30, got ${estWait}`);
console.log('✔ Wait time calculation passed');

// Test 5: Call Next & Barber exclusivity (Ravi customer must NEVER go to Amit)
const mixedQueue = [
  { id: '1', name: 'RaviFan', barberPreference: 'Ravi', status: STATUS.WAITING, createdAt: 1000 },
  { id: '2', name: 'AnyCustomer', barberPreference: 'any', status: STATUS.WAITING, createdAt: 2000 },
];
// Calling next for Amit must skip RaviFan and pick AnyCustomer
const amitNext = callNextForBarber(mixedQueue, 'Amit');
console.assert(amitNext.name === 'AnyCustomer', `T5 exclusivity failed: Amit got ${amitNext?.name}`);

// Calling next for Ravi picks RaviFan
const raviNext = callNextForBarber(mixedQueue, 'Ravi');
console.assert(raviNext.name === 'RaviFan', `T5 Ravi next failed: got ${raviNext?.name}`);
console.log('✔ Call Next & Barber Exclusivity passed');

// Test 6: Online joining cutoff (30 min before closing)
const fakeTimeBeforeCutoff = new Date('2026-11-24T20:00:00');
const fakeTimeAtCutoff = new Date('2026-11-24T20:30:00');
const resAllowed = isOnlineJoiningAllowed(true, '21:00', fakeTimeBeforeCutoff);
const resCutoff = isOnlineJoiningAllowed(true, '21:00', fakeTimeAtCutoff);
const resClosed = isOnlineJoiningAllowed(false, '21:00', fakeTimeBeforeCutoff);

console.assert(resAllowed.allowed === true, 'T6 before cutoff should be allowed');
console.assert(resCutoff.allowed === false && resCutoff.reason === 'cutoff', 'T6 at cutoff should be blocked');
console.assert(resClosed.allowed === false && resClosed.reason === 'closed', 'T6 queue closed should be blocked');
console.log('✔ Online join cutoff rules passed');

console.log('\nAll queue rules unit tests passed! ✨');
