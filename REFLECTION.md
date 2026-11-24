# Reflection

One thing the agent got wrong was a React warning on the Join Queue screen. When I tested `/join`, the browser console showed "Cannot update a component (ToastProvider) while rendering a different component (Join)", pointing at line 43 of `Join.jsx`. The screen still looked and worked correctly, so I only noticed it because I had the console open while testing, not from anything visible in the UI.

The cause was that the agent called `showToast` directly in the body of the Join component. That updates the state of the parent ToastProvider while React is still rendering Join, which React doesn't allow. It can cause duplicate toasts or unpredictable re-renders.

I fixed it with a bug-report prompt in the format from the guide: where it happens (`/join`, line 43), what I saw (the exact console message), and what I expected (no warning). I asked the agent to explain the cause first, then move the `showToast` call into a `useEffect` or an event handler. I also added "Don't change any other behaviour" so it wouldn't touch other screens.

The lesson is that agent-written code can look fine and still hide problems, so I need to check the console and test each flow myself. Giving the agent the exact error, the exact line and a tight scope fixed it in one prompt. I applied the same habit at the end, when Codex reported all 15 checklist items as passing: I re-tested the main flow by hand in separate phone, reception and TV windows instead of trusting its report.
