import {
  GOOGLE_SCOPES,
  buildDayProfile,
  buildDraftRaw,
  buildFallbackFollowUp,
  buildFollowUpPrompt,
  buildPlanPrompt,
  createFocusBlockEvent,
  extractRecipients,
  formatEventRange,
  normalizeEvent,
  stripMarkdown,
  summarizeProfile
} from "./logic.js";
import {
  createCalendarEvent,
  createGmailDraft,
  fetchTodaysEvents,
  generateWithGemini,
  getAccessToken,
  hasGoogleIdentity,
  initGoogleAuth,
  requestGoogleAccess
} from "./google.js";

const storageKey = "orbit-assist-settings";

const elements = {
  clientId: document.querySelector("#clientId"),
  geminiKey: document.querySelector("#geminiKey"),
  role: document.querySelector("#role"),
  goal: document.querySelector("#goal"),
  energy: document.querySelector("#energy"),
  workStyle: document.querySelector("#workStyle"),
  focusLength: document.querySelector("#focusLength"),
  focusBias: document.querySelector("#focusBias"),
  connectGoogle: document.querySelector("#connectGoogle"),
  loadDay: document.querySelector("#loadDay"),
  generatePlan: document.querySelector("#generatePlan"),
  createFocusBlock: document.querySelector("#createFocusBlock"),
  draftFollowUp: document.querySelector("#draftFollowUp"),
  authStatus: document.querySelector("#authStatus"),
  daySummary: document.querySelector("#daySummary"),
  summaryBadge: document.querySelector("#summaryBadge"),
  eventsList: document.querySelector("#eventsList"),
  planOutput: document.querySelector("#planOutput"),
  planMeta: document.querySelector("#planMeta"),
  actionOutput: document.querySelector("#actionOutput")
};

const state = {
  events: [],
  profile: null,
  planText: "",
  googleReady: false
};

function getContext() {
  return {
    role: elements.role.value.trim(),
    goal: elements.goal.value.trim(),
    energy: elements.energy.value,
    workStyle: elements.workStyle.value,
    focusLength: elements.focusLength.value,
    focusBias: elements.focusBias.value
  };
}

function saveSettings() {
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      clientId: elements.clientId.value.trim(),
      geminiKey: elements.geminiKey.value.trim(),
      ...getContext()
    })
  );
}

function hydrateSettings() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return;
  }

  try {
    const data = JSON.parse(raw);
    Object.entries(data).forEach(([key, value]) => {
      if (elements[key] && typeof value === "string") {
        elements[key].value = value;
      }
    });
  } catch {
    localStorage.removeItem(storageKey);
  }
}

function setStatus(message) {
  elements.authStatus.textContent = message;
}

function setAction(message) {
  elements.actionOutput.textContent = message;
}

function mapLocation(location) {
  return location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}` : "";
}

function renderEvents() {
  if (state.events.length === 0) {
    elements.eventsList.innerHTML = '<p class="empty-state">No events found for today.</p>';
    return;
  }

  elements.eventsList.innerHTML = state.events
    .map((event) => {
      const locationUrl = mapLocation(event.location);
      const locationLine = locationUrl
        ? `<p class="event-location"><a href="${locationUrl}" target="_blank" rel="noreferrer">Open location in Google Maps</a></p>`
        : "";

      return `
        <article class="event-card">
          <h3>${event.title}</h3>
          <p class="event-meta">${formatEventRange(event)} • ${event.attendeeCount} attendee(s)</p>
          ${event.location ? `<p class="event-location">${event.location}</p>` : ""}
          ${locationLine}
        </article>
      `;
    })
    .join("");
}

function renderSummary() {
  if (!state.profile) {
    elements.daySummary.textContent = "No calendar imported yet.";
    elements.summaryBadge.textContent = "Waiting for data";
    return;
  }

  const focusWindow = state.profile.focusWindows[0];
  const focusText = focusWindow
    ? `Best open window right now: ${formatEventRange({ start: focusWindow.start, end: focusWindow.end, isAllDay: false })}.`
    : "There is no clean focus window left in the day.";

  elements.daySummary.innerHTML = `
    <strong>${summarizeProfile(state.profile)}</strong><br />
    ${focusText}<br />
    ${state.profile.shouldProtectEnergy ? "Recommendation: defend your energy and reduce context switching." : "Recommendation: lean into execution while the calendar is still manageable."}
  `;
  elements.summaryBadge.textContent = `${state.profile.meetingLoad} load`;
}

function requireToken() {
  const token = getAccessToken();
  if (!token) {
    throw new Error("Connect Google first.");
  }

  return token;
}

async function loadCalendar() {
  saveSettings();
  const token = requireToken();
  setStatus("Loading today's Google Calendar events...");

  const rawEvents = await fetchTodaysEvents(token);
  state.events = rawEvents.map(normalizeEvent);
  state.profile = buildDayProfile(state.events, getContext(), new Date());

  renderEvents();
  renderSummary();
  setStatus("Calendar synced. You can now generate a plan or create actions.");
}

async function connectGoogle() {
  saveSettings();
  if (!elements.clientId.value.trim()) {
    setStatus("Add a Google OAuth client ID first.");
    return;
  }

  if (!hasGoogleIdentity()) {
    setStatus("Google Identity Services script is still loading. Try again in a moment.");
    return;
  }

  if (!state.googleReady) {
    initGoogleAuth({
      clientId: elements.clientId.value.trim(),
      scope: GOOGLE_SCOPES.join(" "),
      onToken: () => {
        setStatus("Google connected. Loading your calendar is now available.");
      },
      onError: (error) => setStatus(`Google auth failed: ${error.message}`)
    });
    state.googleReady = true;
  }

  requestGoogleAccess("consent");
}

async function generatePlan() {
  saveSettings();
  if (!state.profile) {
    throw new Error("Load today's calendar before generating a plan.");
  }

  if (!elements.geminiKey.value.trim()) {
    throw new Error("Add a Gemini API key before generating a plan.");
  }

  elements.planMeta.textContent = "Thinking...";
  elements.planOutput.textContent = "Gemini is turning your calendar and context into a plan.";

  const prompt = buildPlanPrompt({
    events: state.events,
    profile: state.profile,
    context: getContext(),
    now: new Date()
  });
  const text = await generateWithGemini(elements.geminiKey.value.trim(), prompt);

  state.planText = text || "Gemini returned an empty result.";
  elements.planMeta.textContent = "Generated from Gemini + Calendar";
  elements.planOutput.textContent = stripMarkdown(state.planText);
}

async function createFocusBlock() {
  saveSettings();
  if (!state.profile) {
    throw new Error("Load your calendar before creating a focus block.");
  }

  const token = requireToken();
  const eventPayload = createFocusBlockEvent(state.profile, getContext(), new Date());
  const result = await createCalendarEvent(token, eventPayload);

  setAction(`Focus block created on Google Calendar: ${result.summary} at ${new Date(result.start.dateTime).toLocaleString()}`);
  await loadCalendar();
}

async function draftFollowUp() {
  saveSettings();
  if (!state.profile?.anchorMeeting) {
    throw new Error("Load your calendar to choose a meeting for follow-up.");
  }

  const token = requireToken();
  const event = state.profile.anchorMeeting;
  const recipients = extractRecipients(event);
  if (recipients.length === 0) {
    throw new Error("The selected meeting has no attendee emails to draft to.");
  }

  let draft = buildFallbackFollowUp({ event, context: getContext() });

  if (elements.geminiKey.value.trim()) {
    const followUpText = await generateWithGemini(
      elements.geminiKey.value.trim(),
      buildFollowUpPrompt({ event, context: getContext(), planText: state.planText })
    );

    if (followUpText) {
      const subjectMatch = followUpText.match(/Subject:\s*(.+)/i);
      const bodyMatch = followUpText.match(/Body:\s*([\s\S]+)/i);
      draft = {
        subject: subjectMatch?.[1]?.trim() || draft.subject,
        body: bodyMatch?.[1]?.trim() || draft.body
      };
    }
  }

  const raw = buildDraftRaw({
    to: recipients,
    subject: draft.subject,
    body: draft.body
  });
  const result = await createGmailDraft(token, raw);

  setAction(`Gmail draft created for ${event.title}. Draft ID: ${result.id}`);
}

async function withErrorBoundary(task) {
  try {
    await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    setAction(message);
    setStatus(message);
  }
}

hydrateSettings();
renderSummary();

[
  elements.clientId,
  elements.geminiKey,
  elements.role,
  elements.goal,
  elements.energy,
  elements.workStyle,
  elements.focusLength,
  elements.focusBias
].forEach((element) => {
  element.addEventListener("change", saveSettings);
  element.addEventListener("input", saveSettings);
});

elements.connectGoogle.addEventListener("click", () => withErrorBoundary(connectGoogle));
elements.loadDay.addEventListener("click", () => withErrorBoundary(loadCalendar));
elements.generatePlan.addEventListener("click", () => withErrorBoundary(generatePlan));
elements.createFocusBlock.addEventListener("click", () => withErrorBoundary(createFocusBlock));
elements.draftFollowUp.addEventListener("click", () => withErrorBoundary(draftFollowUp));
