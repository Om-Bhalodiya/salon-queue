# Prompts: Salon Queue Management System

All prompts I used with Google Antigravity, in order.

---

## 1. Create the docs

```
Hey, I'm building a Salon Queue Management System for my MSc IT lab. Before
any code, I need you to help me write 4 files: AGENTS.md, docs/01-brief.md,
docs/02-screens.md and docs/03-flows-rules.md.

Here's the idea. On weekends, customers wait 1-2 hours at the salon without
knowing when their turn is. The app has four kinds of users: customer,
receptionist, barber and owner.

Customers join from their phone, pick services and a barber (or "Any"), and
see their position and wait time live. Reception can add walk-ins, call the
next customer and mark no-shows. Barbers get a simple screen to start and
finish a customer or go on break. There's a TV for the waiting area, and the
owner has settings for services, barbers on duty and open/close queue.

I don't want payments, future appointments, SMS/WhatsApp, loyalty or multiple
branches.

The look should be premium: charcoal #1F2937 with gold #D4A017, mobile-first,
rounded cards, English and Gujarati.

Screens: Home (/), Join (/join), My Status (/status/:id), Reception
(/reception, tablet), Barber (/barber/:name, phone), TV (/display), Admin
(/admin). For each one, write the purpose, what's on it top to bottom, what
each button does, how it looks on mobile/tablet/TV, and the empty and error
states.

Rules: Waiting -> Called -> In chair -> Done, never backwards. Waiting ->
Cancelled, and Called -> No-show. It's first come, first served. "Call next"
for a barber picks the earliest customer who chose that barber or "Any", and
someone who chose Ravi should never go to another barber. Wait time is the
total minutes of services ahead divided by barbers working. Only one active
spot per phone number. A no-show who comes back goes to the end of the queue.
Online joining closes 30 minutes before closing. If a barber is on break,
customers who chose them see a message.

Add a test checklist with at least 10 items. In AGENTS.md, keep it short:
React + Vite + Tailwind, `npm run dev`, one screen per task, all labels from
the EN/GU file, queue rules in one place, no "Don't build" features, and
after every task list the changed files and how to test.

If anything is unclear, ask me up to 5 questions first.
```

---

## 2. Answers to its questions

```
Thanks, here are my answers:

1. Backend: not frontend-only. The phone, reception tablet and TV are
   different devices, so localStorage won't sync them. Please use the
   simplest hosted option that works with Vercel and has a free tier
   (Firebase Firestore or Supabase). If you think a small Node + Express
   backend on Render is better, tell me why in 3 lines first. I'd rather
   avoid Render's free-tier sleep delay.

2. Real-time: updates must reach every screen within 5 seconds. Use realtime
   listeners if the backend has them, otherwise polling every 3 seconds.
   No manual refresh.

3. Auth: simple PIN per role. Customer screens (Home, Join, My Status) and
   the TV (/display) are open. Reception, Barber and Owner each need a PIN,
   and the owner can change them in Admin. Use test PINs I can list in the
   README (for example reception 1111, barber 2222, owner 3333).

4. Services: use these defaults, with English and Gujarati names:
   - Haircut, 30 min, ₹150
   - Beard trim, 15 min, ₹80
   - Hair spa, 45 min, ₹400
   - Hair + Beard combo, 40 min, ₹200
   - Hair wash + style, 20 min, ₹120
   Barbers: Ravi, Amit, Imran.

5. Closing time: a fixed closing time that the owner sets in Admin
   (default 9 PM), plus a manual Open/Closed switch that overrides it.
   Online joining closes automatically 30 minutes before closing time.
   Walk-ins are still allowed.

Now write the 4 docs. Don't write any app code yet.
```

---

## 3. Read the docs and plan

```
Read AGENTS.md and all files in docs/. Don't write code yet.
Summarise the app in 8 bullets and tell me anything unclear.
Then show your setup plan and wait for my OK.
```

---

## 4. Step 1: project setup

```
Good summary. Answers:
1. Keep PINs plain-text for the lab demo.
2. Yes, write the seed script, but later, not now.

Go ahead with Step 1 only (scaffold, routes with placeholder headings,
charcoal + gold theme, EN/GU toggle). Don't start Step 2. Stop when
npm run dev runs, then list the changed files and how to test.
```

---

## 5. Add .gitignore

```
Add a .gitignore for a Vite project (node_modules, dist, .env, .env.local,
logs). If node_modules was already committed, remove it from git tracking
(git rm -r --cached node_modules) and amend the last commit. Change nothing
else.
```

---

## 6. Step 2a: Firebase and labels

```
Step 2a only: Firebase init (read config from .env) and the full EN/GU
labels file. Tell me the exact .env variable names. Don't touch any pages.
List the changed files and how to test.
```

---

## 7. Step 2b: queue rules, PIN helper, seed script

```
Step 2b only: queueRules.js, the PIN auth helper and the seed script.
Don't touch any pages. List the changed files and how to test.
```

---

## 8. Home and Join Queue (Antigravity)

```
Build Home (/) and Join Queue (/join) from docs/02-screens.md using the
real Firestore data. Validate a 10-digit phone number, allow at most 3
services, update the live summary as services are selected, block duplicate
phone numbers, and respect the queue open/closed and 30-minute cutoff
rules. Don't touch other screens. List the changed files and how to test.
```

---

## 9. Bug fix: ToastProvider warning on /join (Antigravity)

```
Bug: In the browser console on /join I get "Cannot update a component
(ToastProvider) while rendering a different component (Join)", pointing at
Join.jsx line 43. Expected: no warning. Explain the cause first, then fix
it by moving the showToast call out of the render body (into useEffect or
an event handler). Don't change any other behaviour.
```

---

## 10. Prepare for Vercel (Antigravity)

```
Prepare this app for Vercel: add vercel.json so refreshing any route works,
check the build command, and make sure no localhost URLs are left. Tell me
the environment variables to add on Vercel. Don't change any screens.
```

---

# From here on: OpenAI Codex

Codex reads AGENTS.md automatically, so the docs setup carried over unchanged.

## 11. Step 5: Barber View + TV (OpenAI Codex, worked)

All Antigravity models ran out of quota, so I switched to OpenAI Codex and
gave it this prompt unchanged. Codex built both screens.

```
Build Barber View (/barber/:name) with the PIN gate and the Waiting Area TV
(/display) from docs/02-screens.md. On the Barber screen: current customer
(name, services, timer since start), Start (Called to In chair), Done
(In chair to Done), On break / Available toggle, and "Next for you". Call
autoAssign after Done and after the barber goes Available. On the TV: a row
per barber with the current token, an "Up next" list of 5 with estimated
times, and a gold flash for a newly called token. Everything must update
Reception, the TV and the customer's phone within 5 seconds. Don't touch
other screens. List changed files and how to test.
```

## 12. Owner Settings (Codex)

```
Build ONLY the Owner Settings screen (/admin) from docs/02-screens.md, with
the owner PIN gate.

- Services list: name EN/GU, minutes, price, on/off. Turning a service off
  hides it from Join.
- Barbers on duty today (toggle).
- Open/Closed switch for online joining, plus closing time. When closed, the
  Join button is disabled with a clear message.
- Change PINs for each role.
- Today's stats cards: customers served, average wait, no-shows.

Don't touch other screens except the minimum needed for the service-off and
queue-closed behaviour. List the changed files and how to test.
```

---

## 13. Gujarati and polish (Codex)

```
Check every screen in Gujarati. Fix text that overflows or is not translated,
and any hard-coded English. Make sure tap targets are at least 44px on phone
screens. Add friendly empty states, e.g. "No one waiting - walk right in!".
Don't change the design or the queue rules. List the changed files.
```

---

## 14. Verify against the test checklist (Codex, worked)

```
Go through the full test checklist in docs/03-flows-rules.md. For each item,
report pass/fail and how you checked it. Fix any failures without changing
the design or touching the "Don't build" list. After fixing, re-check the
failed items and list the changed files.
```

Result: Codex reported 15/15 items passing. While checking it also made these
changes: Call Next now orders floating barbers deterministically; opening
/join directly while the queue is closed now shows the block message before
redirecting; Admin gained add, edit and delete controls for services. I then
re-tested the main flow by hand in separate phone, reception and TV windows
(join, called, Start, Done, no-show and re-add, close queue), because the
agent's own pass/fail report should not be trusted without checking.

---

## 15. README (Codex)

```
Create README.md in the project root. The very first line after the title must be:
**Live demo:** https://salon-queue-beta.vercel.app
Right below it, list the test PINs:
**Test PINs:** Reception 1111 · Barber 2222 · Owner 3333
then:
**Hosted on:** Vercel (frontend) + Firebase
Then add a short "About" section (3 to 4 lines on what the app does) and a
"Screens" list with the 7 routes: /, /join, /status/:id, /reception,
/barber/:name, /display, /admin. Add "Run locally: npm install, then npm run dev".
Change nothing else in the project.
```

---

## Notes

- Prompts 1-10 were run in Google Antigravity; 11 onward in OpenAI Codex.
- Prompts that did not work first time are kept in order.
