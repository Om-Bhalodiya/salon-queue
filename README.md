# Salon Queue Management System

**Live demo:** https://salon-queue-beta.vercel.app

**Test PINs:** Reception 1111 · Barber 2222 · Owner 3333

**GitHub repo:** https://github.com/Om-Bhalodiya/salon-queue

**Demo video:** https://github.com/Om-Bhalodiya/salon-queue/blob/main/demo.mp4

**Hosted on:** Vercel (frontend) + Firebase

## About

A queue app for a salon. Customers join from their phone, pick services and a
barber (or "Any"), and see their position and estimated wait live. Reception
adds walk-ins and calls the next customer, barbers start and finish customers,
a waiting-area TV shows who is with which barber, and the owner manages
services, barbers on duty and the open/closed switch. Labels are available in
English and Gujarati.

## Screens

| Route | Who uses it |
|---|---|
| `/` | Customer: home, live queue card |
| `/join` | Customer: join the queue |
| `/status/:id` | Customer: position, wait time, "It's your turn" |
| `/reception` | Receptionist (PIN): tablet dashboard |
| `/barber/:name` | Barber (PIN): phone screen |
| `/display` | Waiting-area TV |
| `/admin` | Owner (PIN): settings and stats |

## Run locally

```
npm install
npm run dev
```

Add your Firebase settings to a `.env` file first (see the variable names in
the Firebase config file).
