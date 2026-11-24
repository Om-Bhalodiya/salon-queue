/**
 * One-time Firestore Database Seeder
 * Populates default services, barbers, settings, and PINs as specified in docs/01-brief.md.
 *
 * Usage:
 *   node scripts/seed.js
 *
 * Requirements:
 *   Ensure .env contains valid VITE_FIREBASE_* variables.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');

// Simple .env parser for Node environment without extra dependencies
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length > 0) {
      process.env[key.trim()] = rest.join('=').trim();
    }
  }
}

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('❌ Error: Firebase configuration missing in .env file.');
  console.error('Please copy .env.example to .env and provide your Firebase credentials before running seed.js.');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 1. Default Services from 01-brief.md
const DEFAULT_SERVICES = [
  { id: 'haircut', nameEN: 'Haircut', nameGU: 'હેરકટ', duration: 30, price: 150, order: 1 },
  { id: 'beard-trim', nameEN: 'Beard Trim', nameGU: 'દાઢી ટ્રિમ', duration: 15, price: 80, order: 2 },
  { id: 'hair-spa', nameEN: 'Hair Spa', nameGU: 'હેર સ્પા', duration: 45, price: 400, order: 3 },
  { id: 'combo', nameEN: 'Hair + Beard Combo', nameGU: 'હેર + દાઢી કોમ્બો', duration: 40, price: 200, order: 4 },
  { id: 'wash-style', nameEN: 'Hair Wash + Style', nameGU: 'હેર વૉશ + સ્ટાઇલ', duration: 20, price: 120, order: 5 },
];

// 2. Default Barbers from 01-brief.md
const DEFAULT_BARBERS = [
  { id: 'ravi', nameEN: 'Ravi', nameGU: 'રવિ', onDuty: true, onBreak: false, order: 1 },
  { id: 'amit', nameEN: 'Amit', nameGU: 'અમિત', onDuty: true, onBreak: false, order: 2 },
  { id: 'imran', nameEN: 'Imran', nameGU: 'ઇમરાન', onDuty: true, onBreak: false, order: 3 },
];

// 3. Default Settings
const DEFAULT_SETTINGS = {
  salonName: 'Royal Salon',
  queueOpen: true,
  closingTime: '21:00',
};

// 4. Default PINs
const DEFAULT_PINS = {
  reception: '1111',
  barber: '2222',
  owner: '3333',
};

async function seed() {
  console.log(`💈 Starting database seed for project: ${firebaseConfig.projectId}...`);

  try {
    // Seed Services
    console.log('Inserting default services...');
    for (const service of DEFAULT_SERVICES) {
      const ref = doc(db, 'services', service.id);
      await setDoc(ref, service);
      console.log(`  ✔ Service: ${service.nameEN} (${service.nameGU}) - ₹${service.price}`);
    }

    // Seed Barbers
    console.log('Inserting default barbers...');
    for (const barber of DEFAULT_BARBERS) {
      const ref = doc(db, 'barbers', barber.id);
      await setDoc(ref, barber);
      console.log(`  ✔ Barber: ${barber.nameEN} (${barber.nameGU})`);
    }

    // Seed Config Settings
    console.log('Writing default configuration...');
    await setDoc(doc(db, 'config', 'settings'), DEFAULT_SETTINGS);
    console.log(`  ✔ Settings: closingTime=${DEFAULT_SETTINGS.closingTime}, queueOpen=${DEFAULT_SETTINGS.queueOpen}`);

    // Seed PINs
    console.log('Writing default PINs...');
    await setDoc(doc(db, 'config', 'pins'), DEFAULT_PINS);
    console.log(`  ✔ PINs: Reception=${DEFAULT_PINS.reception}, Barber=${DEFAULT_PINS.barber}, Owner=${DEFAULT_PINS.owner}`);

    console.log('\n✨ Database seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Seeding failed with error:', err);
    process.exit(1);
  }
}

seed();
