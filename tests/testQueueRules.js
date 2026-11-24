import {
  STATUS,
  isValidTransition,
  hasActiveSpot,
  getPositionInQueue,
  simulateQueueWaitTimes,
  calculateEstimatedWait,
  callNextForBarber,
  callNextAvailable,
  getAutoAssignments,
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

// Test 4: Simulation of queue wait times & Any Barber assignment
// Barbers: Ravi (order 1), Amit (order 2), Imran (order 3, on break)
const testBarbers = [
  { nameEN: 'Ravi', order: 1, onDuty: true, onBreak: false },
  { nameEN: 'Amit', order: 2, onDuty: true, onBreak: false },
  { nameEN: 'Imran', order: 3, onDuty: true, onBreak: true }, // on break -> 0 capacity
];

// Customer A: prefers Ravi (duration 30m, createdAt 1000)
// Customer B: prefers "any" (duration 20m, createdAt 2000)
// Customer C: prefers "any" (duration 15m, createdAt 3000)
const simQueue = [
  { id: 'cust_A', status: STATUS.WAITING, createdAt: 1000, totalDuration: 30, barberPreference: 'Ravi' },
  { id: 'cust_B', status: STATUS.WAITING, createdAt: 2000, totalDuration: 20, barberPreference: 'any' },
  { id: 'cust_C', status: STATUS.WAITING, createdAt: 3000, totalDuration: 15, barberPreference: 'any' },
];

const simResults = simulateQueueWaitTimes(simQueue, testBarbers);

// Customer A goes to Ravi. Ravi is free at 0m. Ravi becomes free at 30m.
const resA = simResults.get('cust_A');
console.assert(resA.expectedBarber === 'Ravi', `T4 Cust A expected Ravi, got ${resA.expectedBarber}`);
console.assert(resA.estimatedWait === 0, `T4 Cust A expected 0 wait, got ${resA.estimatedWait}`);

// Customer B (Any): Ravi free at 30m, Amit free at 0m. Amit is free first!
// Customer B goes to Amit. Wait = 0m. Amit becomes free at 20m.
const resB = simResults.get('cust_B');
console.assert(resB.expectedBarber === 'Amit', `T4 Cust B expected Amit, got ${resB.expectedBarber}`);
console.assert(resB.estimatedWait === 0, `T4 Cust B expected 0 wait, got ${resB.estimatedWait}`);

// Customer C (Any): Ravi free at 30m, Amit free at 20m. Amit is free first (20 < 30)!
// Customer C goes to Amit. Wait = 20m. Amit becomes free at 20 + 15 = 35m.
const resC = simResults.get('cust_C');
console.assert(resC.expectedBarber === 'Amit', `T4 Cust C expected Amit, got ${resC.expectedBarber}`);
console.assert(resC.estimatedWait === 20, `T4 Cust C expected 20m wait, got ${resC.estimatedWait}`);

console.log('✔ Queue simulation and Any Barber assignment passed');

// Test 5: Call Next for barber sets assignedBarber
const mixedQueue = [
  { id: '1', name: 'RaviFan', barberPreference: 'Ravi', status: STATUS.WAITING, createdAt: 1000 },
  { id: '2', name: 'AnyCustomer', barberPreference: 'any', status: STATUS.WAITING, createdAt: 2000 },
];
// Calling next for Amit picks AnyCustomer and sets assignedBarber = Amit
const amitNext = callNextForBarber(mixedQueue, 'Amit');
console.assert(amitNext.name === 'AnyCustomer', `T5 exclusivity failed: Amit got ${amitNext?.name}`);
console.assert(amitNext.assignedBarber === 'Amit', `T5 assignedBarber not set on Amit: got ${amitNext?.assignedBarber}`);

// Calling next for Ravi picks RaviFan and sets assignedBarber = Ravi
const raviNext = callNextForBarber(mixedQueue, 'Ravi');
console.assert(raviNext.name === 'RaviFan', `T5 Ravi next failed: got ${raviNext?.name}`);
console.assert(raviNext.assignedBarber === 'Ravi', `T5 assignedBarber not set on Ravi: got ${raviNext?.assignedBarber}`);
console.log('✔ Call Next & Barber Exclusivity with assignedBarber passed');

// Test 6: Auto-Call rule matching logic
// Barbers: Ravi (free), Amit (busy in chair), Imran (on break)
const autoBarbers = [
  { nameEN: 'Ravi', order: 1, onDuty: true, onBreak: false },
  { nameEN: 'Amit', order: 2, onDuty: true, onBreak: false },
  { nameEN: 'Imran', order: 3, onDuty: true, onBreak: true },
];
const autoQueue = [
  { id: 'in_chair_1', status: STATUS.IN_CHAIR, assignedBarber: 'Amit', createdAt: 500 },
  { id: 'wait_1', name: 'CustRavi', status: STATUS.WAITING, barberPreference: 'Ravi', createdAt: 1000 },
  { id: 'wait_2', name: 'CustAny', status: STATUS.WAITING, barberPreference: 'any', createdAt: 2000 },
];
// Ravi is free; earliest waiting customer for Ravi is CustRavi
const autoPairs = getAutoAssignments(autoQueue, autoBarbers);
console.assert(autoPairs.length === 1, `T6 expected 1 auto-assignment, got ${autoPairs.length}`);
console.assert(autoPairs[0].customer.name === 'CustRavi', `T6 expected CustRavi, got ${autoPairs[0]?.customer?.name}`);
console.assert(autoPairs[0].barberName === 'Ravi', `T6 expected barber Ravi, got ${autoPairs[0]?.barberName}`);
console.log('✔ Auto-Call rule matching passed');

// Test 7: Online joining cutoff (30 min before closing)
const fakeTimeBeforeCutoff = new Date('2026-11-24T20:00:00');
const fakeTimeAtCutoff = new Date('2026-11-24T20:30:00');
const resAllowed = isOnlineJoiningAllowed(true, '21:00', fakeTimeBeforeCutoff);
const resCutoff = isOnlineJoiningAllowed(true, '21:00', fakeTimeAtCutoff);
const resClosed = isOnlineJoiningAllowed(false, '21:00', fakeTimeBeforeCutoff);

console.assert(resAllowed.allowed === true, 'T6 before cutoff should be allowed');
console.assert(resCutoff.allowed === false && resCutoff.reason === 'cutoff', 'T6 at cutoff should be blocked');
console.assert(resClosed.allowed === false && resClosed.reason === 'closed', 'T6 queue closed should be blocked');
console.log('✔ Online join cutoff rules passed');

console.log('\nAll updated queue rules & simulation unit tests passed! ✨');
