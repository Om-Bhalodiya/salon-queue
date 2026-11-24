# 01 — Project Brief

## Problem

On weekends, customers at a neighbourhood salon wait 1–2 hours with no
visibility into their position or estimated wait time. Walk-ins leave when
they see a crowd. The receptionist tracks the queue on paper, barbers shout
names, and the owner has no data on throughput.

## Solution

A real-time web app that lets customers join the queue from their phone, see
their live position and wait time, and get called when it's their turn. Staff
manage the queue from a tablet (reception) or phone (barber). A TV in the
waiting area shows the live queue. The owner configures services, barbers, and
hours from an admin panel.

## User Roles

| Role           | Device   | Auth        | Key actions                                     |
| -------------- | -------- | ----------- | ----------------------------------------------- |
| **Customer**   | Phone    | None (open) | Join queue, pick services + barber, track status |
| **Receptionist** | Tablet | PIN `1111`  | Add walk-ins, call next, mark no-show            |
| **Barber**     | Phone    | PIN `2222`  | Start service, finish service, go on break       |
| **Owner**      | Any      | PIN `3333`  | Manage services, barbers, PINs, open/close queue |

> PINs above are **test defaults**. The owner can change them in Admin.

## Tech Stack

| Layer        | Choice                            | Why                                                        |
| ------------ | --------------------------------- | ---------------------------------------------------------- |
| Frontend     | React 18 + Vite + Tailwind CSS 3  | Fast build, utility-first styling, MSc-lab friendly        |
| Database     | Firebase Firestore (Spark plan)   | Free tier, real-time `onSnapshot`, zero cold-start          |
| Real-time    | Firestore `onSnapshot` listeners  | Updates reach every screen in < 5 s without polling         |
| Hosting      | Vercel                            | Free tier, one-click deploy for Vite SPAs                  |
| Routing      | React Router v6                   | Standard for React SPAs                                    |
| i18n         | Custom `labels.js` (EN + GU)      | Lightweight, no library overhead for two languages          |

### Why Firebase over Supabase / Render

- **Firestore's `onSnapshot`** delivers sub-second real-time updates with
  zero config — Supabase Realtime requires extra setup and has fewer free-tier
  realtime connections.
- **No server to manage.** Firestore is 100 % client-side SDK, so there is no
  cold-start delay (Render's free tier sleeps after 15 min of inactivity).
- **Vercel compatibility.** The app is a pure SPA; no server functions needed.

## Default Data

### Services

| #  | English            | ગુજરાતી              | Duration | Price  |
| -- | ------------------ | --------------------- | -------- | ------ |
| 1  | Haircut            | હેરકટ                 | 30 min   | ₹150   |
| 2  | Beard Trim         | દાઢી ટ્રિમ            | 15 min   | ₹80    |
| 3  | Hair Spa           | હેર સ્પા               | 45 min   | ₹400   |
| 4  | Hair + Beard Combo | હેર + દાઢી કોમ્બો      | 40 min   | ₹200   |
| 5  | Hair Wash + Style  | હેર વૉશ + સ્ટાઇલ      | 20 min   | ₹120   |

### Barbers

| Name  | ગુજરાતી |
| ----- | -------- |
| Ravi  | રવિ      |
| Amit  | અમિત     |
| Imran | ઇમરાન    |

### Queue Configuration

| Setting             | Default  |
| ------------------- | -------- |
| Closing time        | 21:00    |
| Online join cutoff  | 30 min before closing (20:30) |
| Queue status        | Open (manual toggle overrides) |

## Design System

| Token          | Value       |
| -------------- | ----------- |
| Charcoal (bg)  | `#1F2937`   |
| Gold (accent)  | `#D4A017`   |
| Cards          | Rounded corners (`rounded-2xl`), subtle shadow |
| Typography     | System sans-serif, gold headings, white body    |
| Layout         | Mobile-first (320 px → up)                      |
| Languages      | English + ગુજરાતી toggle in header               |

## Scope — Explicitly Excluded

- ❌ Payment processing or checkout
- ❌ Future appointments / booking calendar
- ❌ SMS, WhatsApp, or email notifications
- ❌ Loyalty points or rewards
- ❌ Multi-branch / multi-salon support
