const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const TASKS_BASE = "https://tasks.googleapis.com/tasks/v1";

let tokenClient = null;
let accessToken = "";

function ensureJson(response, fallbackMessage) {
  if (!response.ok) {
    return response.json().catch(() => ({})).then((payload) => {
      const message = payload?.error?.message || fallbackMessage;
      throw new Error(message);
    });
  }

  return response.json();
}

async function authedFetch(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  return ensureJson(response, "Google API request failed");
}

export function hasGoogleIdentity() {
  return Boolean(window.google?.accounts?.oauth2);
}

export function getAccessToken() {
  return accessToken;
}

export function initGoogleAuth({ clientId, scope, onToken, onError }) {
  if (!hasGoogleIdentity()) {
    throw new Error("Google Identity Services failed to load.");
  }

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope,
    callback: (response) => {
      if (response.error) {
        onError?.(new Error(response.error));
        return;
      }

      accessToken = response.access_token;
      onToken?.(response);
    }
  });
}

export function requestGoogleAccess(prompt = "consent") {
  if (!tokenClient) {
    throw new Error("Google auth is not initialized.");
  }

  tokenClient.requestAccessToken({ prompt });
}

export async function fetchTodaysEvents(token, date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    maxResults: "20"
  });

  const payload = await authedFetch(`${CALENDAR_BASE}/calendars/primary/events?${params.toString()}`, token);
  return payload.items || [];
}

export async function createCalendarEvent(token, eventPayload) {
  return authedFetch(`${CALENDAR_BASE}/calendars/primary/events`, token, {
    method: "POST",
    body: JSON.stringify(eventPayload)
  });
}

export async function createGmailDraft(token, raw) {
  return authedFetch(`${GMAIL_BASE}/drafts`, token, {
    method: "POST",
    body: JSON.stringify({
      message: { raw }
    })
  });
}

export async function createGoogleTask(token, task) {
  return authedFetch(`${TASKS_BASE}/lists/@default/tasks`, token, {
    method: "POST",
    body: JSON.stringify(task)
  });
}
