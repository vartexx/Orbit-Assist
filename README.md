# Orbit Assist

Orbit Assist is a tiny browser-based productivity assistant built for a Google Antigravity style challenge. It helps a busy student or knowledge worker turn a messy day into a practical plan by combining live Google Calendar data, Vertex AI reasoning, and lightweight Google Workspace actions.

## Chosen Vertical

Productivity and personal workflow assistance.

## Persona

A student, solo builder, founder, or knowledge worker who has:

- a crowded Google Calendar
- limited energy and time
- one critical goal they must finish today

## What the solution does

Orbit Assist connects to three Google services:

- Google Calendar: reads today's events and creates a focus block
- Gmail: creates a follow-up draft for the most relevant meeting
- Vertex AI: generates a short plan using real schedule data plus user context

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
- Effective Google Services use: Calendar, Gmail, and Vertex AI are all part of the workflow
- Real-world usability: the output is directly actionable
- Maintainable code: minimal Node backend, modular JavaScript, and a small deployment footprint

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
- Vertex AI API

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
- Scopes are limited to the features used by the app

## Accessibility notes

- Semantic HTML sections and button labels
- High-contrast text on light surfaces
- Keyboard-focus states on inputs and actions
- Responsive layout for mobile and desktop

## Submission checklist

- Public GitHub repository
- Single branch only
- Repository size under 1 MB
- README with vertical, logic, how it works, and assumptions
