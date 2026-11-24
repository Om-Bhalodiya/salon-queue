# 03 — Queue Flows, Rules & Test Checklist

---

## 1. State Machine

```
                 ┌───────────┐
         ┌──────►│ Cancelled │
         │       └───────────┘
         │
   ┌─────┴─────┐      ┌────────┐      ┌──────────┐      ┌──────┐
   │  Waiting   ├─────►│ Called ├─────►│ In Chair ├─────►│ Done │
   └────────────┘      └───┬────┘      └──────────┘      └──────┘
                           │
                           ▼
                      ┌─────────┐
                      │ No-show │
                      └─────────┘
```

### Allowed transitions

| From       | To         | Trigger                      |
| ---------- | ---------- | ---------------------------- |
| Waiting    | Called     | Reception taps "Call" or "Call Next" |
| Waiting    | Cancelled  | Customer or reception cancels |
| Called     | In Chair   | Barber taps "Start"          |
| Called     | No-show    | Reception taps "No-show"     |
| In Chair   | Done       | Barber taps "Finish"         |

### Forbidden transitions

- **Never backwards.** A customer cannot go from Called → Waiting, In Chair →
  Called, or Done → anything.
- **No-show is terminal** for that entry. If the customer returns, the
  receptionist taps "Re-add," which creates a **new** entry at the end of the
  queue (not a status reversal).

### Status values in Firestore

```
waiting | called | in_chair | done | cancelled | no_show
```

---

## 2. Queue Ordering — First Come, First Served

- Entries are ordered by their `createdAt` timestamp (Firestore
  `serverTimestamp()`).
- Position in line = count of `waiting` entries with a `createdAt` earlier
  than this entry's `createdAt`.
- A re-added no-show gets a **new** `createdAt` and goes to the end.

---

## 3. "Call Next" Algorithm

When reception taps **"Call Next"** (or the per-card "Call" button):

```
function callNextFor(barberName):
  1. Get all entries where status = "waiting",
     ordered by createdAt ascending.

  2. Find the FIRST entry where:
     a. barberPreference == barberName, OR
     b. barberPreference == "any"

  3. If found:
     - Set entry.status = "called"
     - Set entry.assignedBarber = barberName
     - Set entry.calledAt = serverTimestamp()
     Return entry

  4. If not found:
     Return null  → toast "No one waiting for <barberName>"
```

When the **floating "Call Next" button** is tapped (no specific barber):

```
function callNext():
  1. Get list of available barbers:
     - onDuty == true
     - onBreak == false
     - no current customer in status "called" or "in_chair"

  2. For each available barber (in any deterministic order):
     result = callNextFor(barber)
     if result != null → return result

  3. If no assignment was made → toast "No available barber or queue is empty"
```

### Barber exclusivity rule

> A customer who selected **"Ravi"** can only ever be assigned to Ravi. The
> system will never assign them to Amit or Imran, even if Ravi is busy or on
> break. They wait until Ravi is available.

A customer who selected **"Any"** can be assigned to whichever barber is free
first.

---

## 4. Wait-Time Estimation

```
estimatedWait = totalServiceMinutesAhead / numberOfWorkingBarbers
```

Where:

- **totalServiceMinutesAhead** = sum of `totalDuration` for all entries with
  status `waiting` and `createdAt` < this entry's `createdAt`. Also include
  the remaining time of any `in_chair` customer for each working barber
  (optional refinement).
- **numberOfWorkingBarbers** = count of barbers where `onDuty == true` AND
  `onBreak == false`.
- If `numberOfWorkingBarbers` is 0, display "Wait time unavailable" instead
  of dividing by zero.
- Round up to the nearest 5 minutes for display (e.g., 23 min → "≈ 25 min").

---

## 5. One Active Spot Per Phone Number

- Before creating a new queue entry, check Firestore for any existing doc
  where `phone == inputPhone` AND `status IN [waiting, called, in_chair]`.
- If found → reject with message: "You already have an active spot."
- This applies to both online joins and walk-ins added by reception.

---

## 6. No-Show Re-add

When reception taps **"Re-add"** on a no-show entry:

1. Create a **new** queue document with the same `name`, `phone`, `services`,
   `barberPreference`, and `totalDuration` as the original.
2. The new entry gets a fresh `createdAt` = now → it goes to the **end** of
   the queue.
3. The original entry stays as `no_show` for record-keeping.

---

## 7. Online Join Cutoff

```
cutoffTime = closingTime - 30 minutes
```

- If `currentTime >= cutoffTime` **or** the owner has toggled the queue
  closed, the **Join page** (`/join`) blocks submissions with a message:
  "Online joining is closed. Walk-ins are still welcome!"
- The **Home page** changes the "Join Queue" button to disabled with a
  note.
- **Walk-ins via reception** (`/reception` → "Add Walk-in") are **always**
  allowed regardless of cutoff or queue toggle.

---

## 8. Barber Break Handling

When a barber taps **"Go on Break"**:

1. Set `barbers/{name}.onBreak = true` in Firestore.
2. The barber is **excluded** from the "Call Next" available-barber list.
3. Customers in `waiting` status who selected this barber see a yellow
   banner on `/status/:id`:
   > "Your barber [name] is on a short break. You're still in line."
4. Customers who selected "Any" are unaffected — they'll be assigned to a
   different available barber.
5. When the barber taps **"I'm Back"**, set `onBreak = false` and they
   re-enter the available pool.

---

## 9. Firestore Collections Schema

### `queue` (one doc per customer entry)

| Field            | Type      | Description                                |
| ---------------- | --------- | ------------------------------------------ |
| `id`             | string    | Auto-generated doc ID                      |
| `name`           | string    | Customer name                              |
| `phone`          | string    | 10-digit phone number                      |
| `services`       | string[]  | Array of service IDs                       |
| `totalDuration`  | number    | Sum of service durations (minutes)         |
| `totalPrice`     | number    | Sum of service prices (₹) — display only   |
| `barberPreference` | string  | Barber name or `"any"`                     |
| `assignedBarber` | string    | Barber actually assigned (set on call)     |
| `status`         | string    | `waiting` / `called` / `in_chair` / `done` / `cancelled` / `no_show` |
| `createdAt`      | timestamp | Firestore server timestamp                 |
| `calledAt`       | timestamp | When status changed to `called`            |
| `startedAt`      | timestamp | When status changed to `in_chair`          |
| `finishedAt`     | timestamp | When status changed to `done`              |
| `source`         | string    | `"online"` or `"walk_in"`                  |

### `services` (one doc per service)

| Field        | Type   | Description          |
| ------------ | ------ | -------------------- |
| `id`         | string | Auto-generated       |
| `nameEN`     | string | English name         |
| `nameGU`     | string | Gujarati name        |
| `duration`   | number | Minutes              |
| `price`      | number | Price in ₹           |
| `order`      | number | Display sort order   |

### `barbers` (one doc per barber)

| Field      | Type    | Description                     |
| ---------- | ------- | ------------------------------- |
| `id`       | string  | Auto-generated                  |
| `nameEN`   | string  | English name                    |
| `nameGU`   | string  | Gujarati name                   |
| `onDuty`   | boolean | Appears in join picker if true  |
| `onBreak`  | boolean | Temporarily unavailable         |
| `order`    | number  | Display sort order              |

### `config/settings` (single doc)

| Field         | Type    | Description                      |
| ------------- | ------- | -------------------------------- |
| `queueOpen`   | boolean | Manual override                  |
| `closingTime` | string  | "21:00" (HH:mm)                 |
| `salonName`   | string  | Displayed in headers             |

### `config/pins` (single doc)

| Field       | Type   | Description             |
| ----------- | ------ | ----------------------- |
| `reception` | string | Hashed or plain 4-digit |
| `barber`    | string | Hashed or plain 4-digit |
| `owner`     | string | Hashed or plain 4-digit |

---

## 10. Test Checklist

> Run each test manually after the full app is built. Mark ✅ or ❌.

| #  | Test                                               | Steps                                                                                                              | Expected Result                                                                 |
| -- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 1  | **Customer joins queue**                            | Open `/join`, select Haircut + Beard Trim, pick "Ravi", enter name + phone, tap Join.                              | Redirected to `/status/:id`. Status = Waiting. Position and wait time shown.    |
| 2  | **Duplicate phone blocked**                         | With an active entry for phone 9876543210, try joining again with the same phone.                                  | Toast: "You already have an active spot." Entry not created.                    |
| 3  | **Call Next assigns correct barber**                | Add 3 customers: A (Ravi), B (Any), C (Amit). On Reception, tap Call Next when Ravi is free.                       | Customer A is called for Ravi (not B or C, since A is earliest and chose Ravi). |
| 4  | **Barber exclusivity**                              | Customer chose "Ravi." Ravi is on break, Amit is free. Tap Call Next.                                              | Customer is NOT assigned to Amit. System skips them. Amit gets the next "Any" or "Amit" customer instead. |
| 5  | **Full lifecycle**                                  | Join → Reception calls → Barber starts → Barber finishes.                                                          | Status page shows each stage in order: Waiting → Called → In Chair → Done.      |
| 6  | **No-show re-add**                                  | Mark a called customer as No-show. Then tap Re-add.                                                                | A new entry appears at the END of the queue with the same details. Original stays as no_show. |
| 7  | **Customer cancels own spot**                       | On `/status/:id`, tap Cancel while status = Waiting. Confirm.                                                      | Status changes to Cancelled. Customer is removed from the queue list.           |
| 8  | **Online cutoff enforcement**                       | Set closing time to current time + 20 min. Try to join from `/join`.                                               | Blocked with message about online joining being closed. Walk-in via reception still works. |
| 9  | **Barber break notification**                       | Barber Ravi goes on break. Customer who selected Ravi checks `/status/:id`.                                        | Yellow banner: "Your barber Ravi is on a short break."                          |
| 10 | **Wait time calculation**                           | 3 customers waiting, each with 30-min service, 2 barbers working.                                                  | Customer #3 sees ≈ 45 min (90 total min ÷ 2 barbers = 45). Rounded to nearest 5. |
| 11 | **TV display real-time update**                     | Open `/display` on one screen. On another device, add a customer and call them.                                    | TV shows the customer move from queue to "Now Serving" within 5 seconds.        |
| 12 | **Language toggle**                                 | On any screen, tap the EN/ગુ toggle.                                                                                | All labels, service names, and barber names switch to Gujarati. Toggle back = English. |
| 13 | **PIN auth**                                        | Open `/reception`. Enter wrong PIN. Then enter `1111`.                                                              | Wrong PIN: toast "Incorrect PIN." Correct PIN: access granted, PIN stored in sessionStorage. |
| 14 | **Admin: add/edit/delete service**                  | In Admin, add a new service "Facial, ફેશિયલ, 60 min, ₹500." Edit its price to ₹550. Delete it.                     | Service appears in join page after add, price updates after edit, disappears after delete. |
| 15 | **Queue open/close toggle**                         | In Admin, toggle queue to Closed. Check Home page and `/join`.                                                     | Home shows "Queue Closed." Join page blocks entry. Reception can still add walk-ins. |
