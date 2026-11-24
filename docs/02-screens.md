# 02 — Screen Specifications

> **Design constants for every screen:**
> Background: charcoal `#1F2937` · Accent: gold `#D4A017` · Cards: `rounded-2xl`,
> semi-transparent white/dark glass · Text: white body, gold headings ·
> Language toggle (EN / ગુ) in the top-right of every header.

---

## 1. Home — `/`

### Purpose
Landing page. Tells the customer what this salon app does and funnels them to
"Join Queue" or "Track My Status."

### Layout (top → bottom)

| #  | Element                        | Details                                                              |
| -- | ------------------------------ | -------------------------------------------------------------------- |
| 1  | **Header bar**                 | Salon name (gold, large) + language toggle (EN / ગુ)                  |
| 2  | **Hero section**               | Tagline: "Skip the wait. Join from your phone." + scissors icon/SVG  |
| 3  | **Live queue badge**           | Pill showing "Queue Open · 4 waiting" or "Queue Closed" (red pill)   |
| 4  | **"Join Queue" button**        | Gold, full-width, rounded. Navigates to `/join`                      |
| 5  | **"Track My Status" button**   | Outline/ghost button. Prompts for phone number, then goes to `/status/:id` |
| 6  | **Footer**                     | "Today's hours: 10 AM – 9 PM" pulled from Firestore config          |

### Button actions

| Button            | Action                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Join Queue        | If queue is open and within online cutoff → navigate to `/join`. Otherwise show toast: "Online joining is closed. Please visit the salon." |
| Track My Status   | Show a bottom-sheet / modal asking for phone number. Look up the latest active entry for that number. If found → `/status/:id`. If not → toast: "No active entry found." |

### Responsive

| Breakpoint     | Behaviour                                                   |
| -------------- | ----------------------------------------------------------- |
| Mobile (< 640) | Single column, stacked, full-width buttons                  |
| Tablet (≥ 768) | Centred card max-w-md, more whitespace                      |
| TV             | Not intended for TV (TV uses `/display`)                    |

### Empty state
Queue badge shows "Queue Closed" in a red pill when the owner has toggled the
queue off or it's past closing time.

### Error state
If Firestore is unreachable, show a charcoal card with a warning icon:
"Could not connect. Please check your internet and try again." + a "Retry"
button.

---

## 2. Join Queue — `/join`

### Purpose
Customer picks services, selects a barber (or "Any"), enters their name and
phone, and joins the queue.

### Layout (top → bottom)

| #  | Element                        | Details                                                                      |
| -- | ------------------------------ | ---------------------------------------------------------------------------- |
| 1  | **Header bar**                 | ← Back arrow + "Join Queue" title + language toggle                          |
| 2  | **Service picker**             | Scrollable list of service cards. Each shows name (EN/GU), duration, price. Tap to select (gold border + checkmark). Multi-select allowed. |
| 3  | **Barber picker**              | Horizontal row of avatar circles: "Any" (default, highlighted) + Ravi, Amit, Imran. Single-select. If a barber is on break, show a small "On break" badge — still selectable but with a note: "May wait longer." |
| 4  | **Customer name input**        | Text field, required. Placeholder: "Your name / તમારું નામ"                    |
| 5  | **Phone number input**         | Tel field, 10 digits, required. Used as the unique identifier.               |
| 6  | **Summary card**               | Shows: selected services, total duration, total price (display only), estimated wait. |
| 7  | **"Join" button**              | Gold, full-width. Disabled until ≥ 1 service + name + valid phone.           |

### Button actions

| Button | Action                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| Join   | 1. Check phone number isn't already in the queue (status = Waiting or Called). If duplicate → toast: "You already have an active spot." 2. Write a new doc to `queue` collection with status `waiting`, timestamp `serverTimestamp()`, selected services, barber preference, total duration. 3. Navigate to `/status/:id` with the new doc ID. |

### Responsive

| Breakpoint     | Behaviour                                                            |
| -------------- | -------------------------------------------------------------------- |
| Mobile (< 640) | Single column, service cards stack vertically, full-width inputs     |
| Tablet (≥ 768) | Service cards in a 2-column grid, form centred max-w-lg              |

### Empty state
If no services exist in Firestore (owner deleted all), show: "No services
available right now. Please check with the receptionist."

### Error states

| Condition                  | Message                                                        |
| -------------------------- | -------------------------------------------------------------- |
| Queue closed               | Redirect back to `/` with toast: "Queue is currently closed."  |
| Online cutoff passed       | Toast: "Online joining closes 30 min before closing. Walk-ins welcome." |
| Duplicate phone            | Toast: "You already have an active spot in the queue."         |
| Firestore write failed     | Toast: "Something went wrong. Please try again."               |

---

## 3. My Status — `/status/:id`

### Purpose
The customer's real-time ticket. Shows their position, estimated wait, and
current status with a visual progress bar.

### Layout (top → bottom)

| #  | Element                        | Details                                                                       |
| -- | ------------------------------ | ----------------------------------------------------------------------------- |
| 1  | **Header bar**                 | Salon name + language toggle (no back arrow — this is a bookmark-able URL)    |
| 2  | **Status badge**               | Large coloured pill: 🟡 Waiting · 🟢 Called ("Your turn!") · 🔵 In Chair · ✅ Done · ❌ Cancelled / No-show |
| 3  | **Progress stepper**           | Horizontal 4-step bar: Waiting → Called → In Chair → Done. Active step highlighted gold. |
| 4  | **Position card**              | "You are **#3** in line" (large number). Hidden when status ≠ Waiting.        |
| 5  | **Estimated wait card**        | "≈ 25 min remaining". Hidden when status ≠ Waiting.                           |
| 6  | **Assigned barber card**       | Shows barber name + avatar when status = Called or In Chair.                  |
| 7  | **Services list**              | Compact list of selected services + total duration.                           |
| 8  | **Barber on break notice**     | Yellow banner: "Your barber Ravi is on a short break. You're still in line." Shown only when the preferred barber is on break and status = Waiting. |
| 9  | **"Cancel" button**            | Red outline button. Only visible when status = Waiting.                       |
| 10 | **"Done" card**                | When status = Done: "All done! Thank you for visiting. 💈" No action needed.  |

### Button actions

| Button  | Action                                                                           |
| ------- | -------------------------------------------------------------------------------- |
| Cancel  | Confirm dialog: "Cancel your spot?" → Yes: update doc status to `cancelled`. Redirect to `/`. |

### Responsive

| Breakpoint     | Behaviour                                               |
| -------------- | ------------------------------------------------------- |
| Mobile (< 640) | Single column, large status badge centred                |
| Tablet (≥ 768) | Centred card max-w-md                                    |

### Empty state
If the `:id` doesn't match any doc in Firestore: "Ticket not found. It may
have expired." + "Back to Home" button.

### Error state
Firestore disconnect: "Live updates paused. Reconnecting…" banner at top.

---

## 4. Reception — `/reception`

### Purpose
Receptionist's dashboard on a tablet. Shows the full queue, lets them add
walk-ins, call the next customer, and manage no-shows.

### Auth
PIN entry screen on first visit. PIN stored in `sessionStorage` (clears on
tab close). Default PIN: `1111`.

### Layout (top → bottom)

| #  | Element                          | Details                                                                       |
| -- | -------------------------------- | ----------------------------------------------------------------------------- |
| 1  | **Header bar**                   | "Reception" title + queue Open/Closed pill + language toggle + 🔓 Lock button (clears PIN, returns to PIN screen) |
| 2  | **Stats bar**                    | Three compact cards: "Waiting: 5" · "In Chair: 2" · "Done today: 14"         |
| 3  | **"Add Walk-in" button**         | Gold button top-right. Opens a modal/bottom-sheet identical to the Join form but filled by the receptionist. |
| 4  | **Queue list**                   | Scrollable list of cards, sorted oldest-first. Each card shows: customer name, phone, services (tags), barber preference, time joined, status badge. |
| 5  | **Per-card action buttons**      | Contextual, based on status (see table below).                                |
| 6  | **Filter tabs**                  | "All" · "Waiting" · "Called" · "In Chair" · "Done" · "No-show"               |

### Per-card actions by status

| Current status | Buttons shown                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Waiting        | **Call** (assigns to correct barber, see queue rules) · **Cancel**                                                   |
| Called         | **No-show** (moves to no-show) · **Cancel**                                                                          |
| In Chair       | _(No actions — barber manages this from their screen)_                                                               |
| Done           | _(Greyed out, read-only)_                                                                                            |
| No-show        | **Re-add** (creates a new entry at the end of the queue with same details)                                           |

### "Call Next" floating button
A prominent gold FAB (floating action button) in the bottom-right: **"Call
Next"**. Tapping it:
1. Finds the earliest `waiting` customer whose barber preference matches an
   available (not on break, not busy) barber — or preference is "Any."
2. Updates their status to `called` and assigns the barber.
3. Shows a brief toast: "Called: Amit → Ravi" (customer name → barber name).
4. If no one is waiting, toast: "Queue is empty."

### Responsive

| Breakpoint     | Behaviour                                                             |
| -------------- | --------------------------------------------------------------------- |
| Mobile (< 640) | Usable but cramped; single-column card list, bottom-sheet for add      |
| Tablet (≥ 768) | **Primary layout.** Two-column: queue list left, stats + actions right |

### Empty state
Queue list area shows: "No customers in the queue. Tap **Add Walk-in** to get
started." with an illustration or icon.

### Error state
Firestore disconnect: red banner "Connection lost. Queue may be out of date.
Reconnecting…"

---

## 5. Barber — `/barber/:name`

### Purpose
Barber's personal screen (phone). Shows their current customer and lets them
start the service, finish it, or go on break.

### Auth
PIN entry screen on first visit. Default PIN: `2222`.

### Layout (top → bottom)

| #  | Element                          | Details                                                                        |
| -- | -------------------------------- | ------------------------------------------------------------------------------ |
| 1  | **Header bar**                   | "Barber: Ravi" (name from URL) + status pill ("Available" / "Busy" / "On Break") + language toggle + 🔓 Lock |
| 2  | **Current customer card**        | Large card showing: customer name, services list, total duration, time since called. Visible only when a customer is `called` or `in_chair` for this barber. |
| 3  | **"Start" button**               | Gold, full-width. Visible when a customer is `called`. Updates status to `in_chair`. |
| 4  | **"Finish" button**              | Green, full-width. Visible when a customer is `in_chair`. Updates status to `done`. |
| 5  | **"Break" / "Back" toggle**      | Secondary button. "Go on Break" (orange) when available. "I'm Back" (green) when on break. |
| 6  | **Up-next preview**              | Small card below: "Next: Priya (Haircut + Beard Trim)". Shows the next `waiting` customer assigned or eligible for this barber. If no one, shows "No one waiting." |

### Button actions

| Button     | Action                                                                        |
| ---------- | ----------------------------------------------------------------------------- |
| Start      | Update customer status `called` → `in_chair`, record start timestamp.         |
| Finish     | Update customer status `in_chair` → `done`, record end timestamp.             |
| Go on Break | Set barber's Firestore doc `onBreak: true`. All customers who chose this barber and are `waiting` see the break notice on their status page. The barber cannot be assigned new customers via "Call Next" while on break. |
| I'm Back   | Set `onBreak: false`. Barber is available for new assignments.                 |

### Responsive

| Breakpoint     | Behaviour                                                   |
| -------------- | ----------------------------------------------------------- |
| Mobile (< 640) | **Primary layout.** Single column, large tap targets.       |
| Tablet (≥ 768) | Centred card max-w-sm                                        |

### Empty state
No customer assigned: large card says "No customer right now. Relax! 💈" with
the up-next preview below.

### Error state
Firestore disconnect: "Connection lost. Tap Retry when back online." + Retry
button.

---

## 6. TV Display — `/display`

### Purpose
Full-screen display for the salon's waiting-area TV. Shows who is being
served, who is next, and the live queue — no interaction needed.

### Auth
None. Open URL.

### Layout (top → bottom)

| #  | Element                          | Details                                                                                   |
| -- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| 1  | **Header bar**                   | Salon name (large, gold) + current time + "Open" / "Closed" pill. No language toggle — shows both EN and GU side by side. |
| 2  | **"Now Serving" section**        | Row of barber cards (up to 3). Each card: barber name, customer name, service, elapsed time. Highlighted gold border. Empty card says "Available." |
| 3  | **"Up Next" section**            | The next 1–2 customers in line: name, services. Gold text.                                 |
| 4  | **Queue list**                   | Remaining `waiting` customers: position number, name (first name + last initial), services. Scrolls automatically if > 8 entries (smooth vertical marquee). |
| 5  | **Footer ticker**                | Scrolling text: "Thank you for waiting · Services: Haircut ₹150, Beard Trim ₹80…" etc.    |

### Responsive

| Breakpoint     | Behaviour                                                               |
| -------------- | ----------------------------------------------------------------------- |
| Mobile (< 640) | Not intended for mobile. Shows a note: "This page is for the salon TV." |
| Tablet (≥ 768) | Usable, single-column layout                                            |
| TV / Desktop   | **Primary layout.** Full-viewport, no scroll bars, large fonts (24–48 px), dark background, auto-advances. |

### Empty state
"Now Serving" cards all say "Available." Queue list shows: "No one waiting —
walk in or join from your phone!" with a QR code placeholder pointing to `/`.

### Error state
If Firestore disconnects: subtle "Reconnecting…" pill in top-right corner.
Queue data stays on-screen (stale but better than blank).

---

## 7. Admin — `/admin`

### Purpose
Owner's settings panel. Manage services, barbers, PINs, and queue hours.

### Auth
PIN entry screen on first visit. Default PIN: `3333`.

### Layout (top → bottom)

| #  | Element                          | Details                                                                       |
| -- | -------------------------------- | ----------------------------------------------------------------------------- |
| 1  | **Header bar**                   | "Admin Panel" + language toggle + 🔓 Lock button                              |
| 2  | **Queue control card**           | Toggle switch: "Queue Open / Closed". When closed, the Home page shows "Queue Closed" and Join is blocked. Walk-ins via reception still allowed. |
| 3  | **Closing time setting**         | Time picker for daily closing time (default 21:00). Below it: "Online joining closes at 20:30" (auto-calculated, read-only). |
| 4  | **Services section**             | Table/list of services: English name, Gujarati name, duration (min), price (₹). Each row has Edit (pencil icon) and Delete (trash icon). **"+ Add Service"** button at top. Add/Edit opens an inline form or modal. |
| 5  | **Barbers section**              | List of barbers: name (EN), name (GU), on-duty toggle. **"+ Add Barber"** button. On-duty toggle controls whether the barber appears in the Join page barber picker and in the "Call Next" logic. |
| 6  | **PINs section**                 | Three fields: Reception PIN, Barber PIN, Owner PIN. "Save PINs" button. Validation: 4-digit numeric. |
| 7  | **Danger zone**                  | "Clear today's queue" button (red). Confirm dialog: "This will mark all waiting/called entries as cancelled. Are you sure?" |

### Button actions

| Button            | Action                                                                   |
| ----------------- | ------------------------------------------------------------------------ |
| Queue toggle      | Update `config/settings.queueOpen` in Firestore. Immediate effect.       |
| Save closing time | Update `config/settings.closingTime`. Recalculates online cutoff.        |
| Add Service       | Open modal with fields: EN name, GU name, duration, price. Save to `services` collection. |
| Edit Service      | Pre-fill modal with current values. Save updates the doc.                |
| Delete Service    | Confirm dialog → delete the doc. Does not affect customers already in queue with that service. |
| Add Barber        | Modal: EN name, GU name. Save to `barbers` collection (on-duty defaults true). |
| On-duty toggle    | Update barber doc `onDuty` field. Off-duty barber disappears from Join picker. If a barber is toggled off-duty while customers are waiting for them, those customers see: "Your barber is off duty. The receptionist will reassign you." |
| Save PINs         | Validate (4 digits each) → update `config/pins` doc. Takes effect on next PIN entry. |
| Clear queue       | Batch-update all `waiting` and `called` docs to `cancelled`.             |

### Responsive

| Breakpoint     | Behaviour                                                     |
| -------------- | ------------------------------------------------------------- |
| Mobile (< 640) | Single column, sections stack. Usable but owner likely uses a larger screen. |
| Tablet (≥ 768) | Two-column: queue controls + services left, barbers + PINs right. |

### Empty state
Services section: "No services configured. Tap **+ Add Service** to begin."
Barbers section: "No barbers added. Tap **+ Add Barber**."

### Error state
Save failure: toast "Could not save. Please try again." Field stays in edit
mode so data isn't lost.
