# Orbit Assist

Orbit Assist is a tiny browser-based productivity assistant built for a Google Antigravity style challenge. It is intentionally designed for a deadline-driven student or solo builder who needs help deciding what to do next when classes, meetings, submissions, demos, and follow-ups all collide in one day.

## Chosen Vertical

Student productivity and workflow assistance.

## Problem Statement Alignment

This submission targets one specific persona instead of a generic assistant:

- a final-year student, solo builder, or founder preparing for submissions, demos, interviews, classes, and team meetings in the same day

The core problem is overload:

- Google Calendar is full, so the user loses track of what deserves focus
- deadlines compete with meetings and reactive work
- follow-ups after important conversations are easy to miss
- the user needs practical decisions, not generic motivation

Orbit Assist addresses that problem directly by using Google services to:

- understand the real schedule from Google Calendar
- reason over the day with Vertex AI
- create a protected focus block back in Google Calendar
- draft a follow-up email in Gmail
- save the generated plan as actionable items in Google Tasks
- log workflow analytics in BigQuery
- open Google Maps links for location-aware meetings

## Persona

A final-year student, solo builder, founder, or knowledge worker who has:

- a crowded Google Calendar
- limited energy and time
- one critical goal they must finish today

## What the solution does

Orbit Assist connects to core Google services inside one workflow:

- Google Calendar: reads today's events and creates a focus block
- Gmail: creates a follow-up draft for the most relevant meeting
- Google Tasks: saves the generated plan as a trackable task list
- Vertex AI: generates a short plan using real schedule data plus user context
- BigQuery: stores workflow analytics such as plan generation and action completion events
- Google Maps links: opens meeting locations directly from calendar-derived event data

The user supplies:

- role
- top goal
- energy level
- work style
- preferred focus block length
- preferred part of the day for deep work

The assistant then:

1. imports today's calendar events
2. measures meeting load and open focus windows
3. decides whether the user should protect energy or push execution
4. asks Vertex AI for a concise action plan
5. lets the user create a focus block in Calendar
6. drafts a follow-up email in Gmail for the most relevant meeting
7. saves the most important action items to Google Tasks
8. logs assistant workflow events to BigQuery for analytics
9. opens Google Maps links when a meeting has a location

## Example user journey

1. A final-year student opens Orbit Assist before a deadline-heavy day.
2. The app reads Google Calendar and sees classes, reviews, interviews, or project meetings.
3. Orbit Assist determines whether there is still realistic focus time left.
4. Vertex AI generates a short plan using meeting pressure, energy level, and the top goal.
5. The user creates a focus block on Google Calendar with one click.
6. After an important meeting, Orbit Assist drafts a Gmail follow-up so momentum is not lost.
7. The generated plan can be saved into Google Tasks so the student has a persistent checklist.

## Logic and decision making

The logic is intentionally simple and explainable:

- Meeting load is classified as `light`, `moderate`, or `heavy`
- Open time gaps in the day become candidate focus windows
- Energy level changes the recommended focus block duration
- Focus bias selects an early, middle, or late focus window
- The next future meeting with attendees becomes the default follow-up target

This keeps the assistant practical, deterministic, and easy to maintain.

## Why this fits the challenge

- Smart dynamic assistant: it reacts to live calendar data and user context
- Logical decision making: focus recommendations come from clear scheduling rules
- Effective Google Services use: Calendar, Gmail, Google Tasks, Google Maps, BigQuery, Vertex AI, and Cloud Run all support the workflow
- Real-world usability: the output is directly actionable
- Maintainable code: minimal Node backend, modular JavaScript, and a small deployment footprint

## Evaluation mapping

- Code Quality: logic is separated into reusable modules, the UI is intentionally small, and backend responsibilities are isolated in one server file
- Security: Vertex AI runs on Cloud Run server-side, least-privilege Google scopes are used in the browser, and the server sends security headers
- Efficiency: small static frontend, lightweight Node server, no heavy framework, and a local planning fallback when AI is unavailable
- Testing: unit tests cover scheduling logic, payload building, fallback planning, and follow-up generation helpers
- Accessibility: semantic labels, live regions, keyboard focus states, a skip link, and responsive layouts for mobile and desktop
- Google Services: Google Calendar, Gmail, Google Tasks, Google Maps, BigQuery, Vertex AI, and Google Cloud Run are all core parts of the user flow

## Project structure

```text
.
|-- index.html
|-- styles.css
|-- src/
|   |-- app.js
|   |-- google.js
|   `-- logic.js
|-- scripts/
|   `-- serve.mjs
|-- tests/
|   `-- logic.test.js
`-- README.md
```

## Setup

### 1. Google Cloud

Create a Google Cloud project and enable the required APIs:

- Google Calendar API
- Gmail API
- Google Tasks API
- Vertex AI API
- BigQuery API

Create an OAuth client ID for a Web application and add these authorized JavaScript origins:

- `http://localhost:4173`
- `https://orbit-assist-1044325459007.asia-south1.run.app`

### 2. Vertex AI

Enable Vertex AI in your Google Cloud project.

The app does not need a model API key in the browser. Cloud Run calls Vertex AI
using Google service account credentials.

### 3. Run locally

```bash
npm run dev
```

Open `http://localhost:4173`.

For local server-side Vertex AI calls, authenticate Application Default
Credentials:

```bash
gcloud auth application-default login
```

## Testing

Run:

```bash
npm test
```

The tests cover core scheduling and payload-building logic.

Current coverage includes:

- meeting-load classification
- focus window selection
- calendar event creation payloads
- Gmail draft encoding
- fallback planning logic
- follow-up generation helpers
- task extraction from generated plans

## Deploy on Cloud Run

This app can be deployed directly to Google Cloud Run as a public web service.

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com aiplatform.googleapis.com

gcloud run deploy orbit-assist \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated
```

After deployment, open the Cloud Run URL and enter your Google OAuth Client ID in the UI.

## Assumptions made

- A static app is acceptable for the challenge and helps keep the repository very small
- Users can provide their own OAuth client ID during demo/setup
- The challenge values working Google integrations over production deployment complexity
- Cloud Run is allowed to call Vertex AI with the service account attached to the service

## Security notes

- No secrets are stored in the repository
- The browser stores only the OAuth client ID and user preferences for convenience
- Vertex AI calls happen on the backend through Cloud Run
- Analytics events are stored in BigQuery from the backend for workflow visibility
- Scopes are limited to the features used by the app
- The server returns security headers including CSP, `X-Frame-Options`, and `X-Content-Type-Options`

## Accessibility notes

- Semantic HTML sections and button labels
- High-contrast text on light surfaces
- Keyboard-focus states on inputs and actions
- Responsive layout for mobile and desktop
- A skip link is included for keyboard users
- Status updates use `aria-live` regions for assistive technologies

## Submission checklist

- Public GitHub repository
- Single branch only
- Repository size under 1 MB
- README with vertical, logic, how it works, and assumptions
