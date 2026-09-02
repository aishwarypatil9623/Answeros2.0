# AnswerOS Mentor v1 — setup

## What is already in this branch

- `answeros-mentor.html` — Mentor UI.
- `mentor/AGENTS.md` — mentor constitution.
- `mentor/mentor-output.schema.json` — output contract.
- `mentor/mentor-state.example.json` — persistent-state example.
- `mentor/AppsScript_Mentor_Bridge.gs` — backend bridge.

## 1. Add the bridge to the existing Apps Script

Open the Apps Script project that currently serves the AnswerOS Google Sheet API and paste/merge `AppsScript_Mentor_Bridge.gs`.

Do **not** replace the existing `doGet(e)` blindly. Add this branch near the top of the existing router:

```js
const mentorResponse = mentorDoGet_(e);
if (mentorResponse) return mentorResponse;
```

The existing answer-data endpoint must continue to behave exactly as before.

## 2. Script properties

Add:

- `GEMINI_API_KEY` — Gemini API key. Keep this server-side only.
- `MENTOR_AGENT_ID` — optional named managed-agent ID. Leave blank initially to use the Antigravity preview base agent.

## 3. One-time setup

Run `installMentorTrigger()` manually once and authorize the Apps Script project.

This creates a 5-minute worker trigger. The worker is intentionally asynchronous because Antigravity interactions can take minutes and support background execution.

## 4. Queue the evaluated answer

At the point in the existing evaluation/write workflow where a completed answer has been successfully written to the Mains Tracker, call:

```js
mentorEnqueueAnswer_(answerId);
```

Use the same stable ID as the answer's `PDF ID` when available.

## 5. Mentor state

The bridge creates these sheets automatically if missing:

- `MENTOR_STATE`
- `MENTOR_LOG`
- `MENTOR_QUEUE`

Google Sheets remains the source of truth. The browser only reads the latest mentor state.

## 6. Important security rule

Never put `GEMINI_API_KEY` in `answeros-data.js`, `answeros-mentor.html`, GitHub Pages, or any client-side JavaScript.

The browser calls the existing Apps Script Web App with `action=mentor_state`; Apps Script holds the Gemini credential.

## 7. Current MVP behavior

`MENTOR_QUEUE` → Antigravity background interaction → polling → JSON validation/extraction → `MENTOR_STATE` + `MENTOR_LOG` → Mentor page.

The mentor is deliberately not responsible for recomputing Dashboard/Analytics metrics. Those remain deterministic AnswerOS calculations.

## 8. Before merging to main

Test with one known evaluated answer and confirm:

1. answer row exists;
2. queue row becomes `queued`;
3. worker changes it to `running`;
4. interaction completes;
5. `MENTOR_STATE.state_json` is valid JSON;
6. `MENTOR_LOG` records the interaction;
7. `answeros-mentor.html?action=mentor_state` renders the state;
8. existing Dashboard/Analytics sync is unaffected.
