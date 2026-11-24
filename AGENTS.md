# AGENTS.md — Build Instructions for Salon Queue

## Stack

| Layer       | Tool                                      |
| ----------- | ----------------------------------------- |
| Frontend    | React 18 + Vite + Tailwind CSS 3          |
| Backend/DB  | Firebase Firestore (Spark free tier)      |
| Real-time   | Firestore `onSnapshot` listeners          |
| Hosting     | Vercel (static SPA)                       |
| i18n        | Single `src/i18n/labels.js` (EN + GU)     |
| Routing     | React Router v6                           |

## Dev command

```bash
npm run dev          # starts Vite on localhost:5173
```

## Rules for every task

| #  | Rule                                                                                                 |
| -- | ---------------------------------------------------------------------------------------------------- |
| 1  | **One screen per task.** Finish, test, and commit a screen before starting the next.                 |
| 2  | **All user-facing text** comes from `src/i18n/labels.js`. Never hard-code English or Gujarati.       |
| 3  | **Queue logic lives in one file:** `src/lib/queueRules.js`. Every screen imports from it.            |
| 4  | **Design tokens** in `tailwind.config.js`: charcoal `#1F2937`, gold `#D4A017`. Use only these.      |
| 5  | **Firebase config** in `src/lib/firebase.js`. Collections: `queue`, `services`, `barbers`, `config`. |
| 6  | **PIN auth** via `src/lib/auth.js`. PINs stored in Firestore `config/pins` doc.                     |
| 7  | **Mobile-first.** Every component starts at 320 px, then scales up with Tailwind breakpoints.        |

## Do NOT build

- Payment processing or pricing checkout
- Future appointment / booking calendar
- SMS, WhatsApp, or email notifications
- Loyalty points or rewards
- Multi-branch / multi-salon support

## After every task — required checklist

```
### Task: <Screen name>
**Changed files:**
- src/pages/ScreenName.jsx
- src/components/SomeComponent.jsx
- ...

**How to test:**
1. Open localhost:5173/<route>
2. <Exact steps to verify the feature>
3. Expected result: <what the tester should see>
```

## Task order (suggested)

1. Project scaffold (Vite + Tailwind + Firebase + Router shell)
2. `src/i18n/labels.js` + `src/lib/queueRules.js` + `src/lib/firebase.js`
3. Home page `/`
4. Join page `/join`
5. My Status page `/status/:id`
6. Reception page `/reception`
7. Barber page `/barber/:name`
8. TV Display page `/display`
9. Admin page `/admin`
10. Final integration test + README
