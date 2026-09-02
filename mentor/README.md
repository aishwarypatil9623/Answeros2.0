# AnswerOS Mentor — v1 architecture

This folder defines the contract between AnswerOS and the Gemini Antigravity managed agent.

## Data flow

Google Sheet → Apps Script → AnswerOS data layer → mentor snapshot → Antigravity → structured diagnosis → Mentor State + Mentor Log → AnswerOS Mentor UI.

The existing AnswerOS data layer already exposes normalized answer records and emits `answeros:data-updated` after synchronization. The mentor should use that event only as a signal; authoritative state belongs server-side.

## Trigger rule

Run the mentor after a **meaningful evaluated-answer update**, not every browser refresh. Deduplicate using the answer ID plus a data/version hash.

## Context sent to the agent

- New evaluated answer
- Last 10-15 comparable answers
- Recent all-subject trend summary
- Subject/paper trend summary
- Recurring feedback-gap counts
- Previous mentor state
- Previous intervention and outcome
- Relevant goals/targets when available

## What the agent returns

Strict JSON matching `mentor-output.schema.json`:
- diagnosis
- progress
- intervention
- mentor_message

## Safety / reliability

- Never expose the Gemini API key in frontend JavaScript.
- Do not let the agent directly mutate the production UI repository in the first version.
- Persist mentor state separately from browser localStorage.
- Preserve the raw agent response for audit/debugging.
- If the agent fails, AnswerOS continues to work normally and shows the last successful mentor diagnosis.

## Antigravity integration

Google's current Managed Agents API supports the `antigravity-preview-05-2026` agent through the Interactions API, remote Linux environments, custom system instructions, files/skills, and background execution. Prototype first, then persist as a managed agent once the contract is stable.
