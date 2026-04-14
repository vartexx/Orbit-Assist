export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.compose"
];

const MINUTE = 60 * 1000;

function toDate(value) {
  return value ? new Date(value) : null;
}

function minutesBetween(start, end) {
  return Math.max(0, Math.round((end - start) / MINUTE));
}

export function formatTime(dateLike) {
  const date = typeof dateLike === "string" ? new Date(dateLike) : dateLike;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatEventRange(event) {
  if (event.isAllDay) {
    return "All day";
  }

  return `${formatTime(event.start)} to ${formatTime(event.end)}`;
}

export function normalizeEvent(event) {
  const isAllDay = Boolean(event?.start?.date && !event?.start?.dateTime);
  const start = toDate(event?.start?.dateTime || event?.start?.date);
  const end = toDate(event?.end?.dateTime || event?.end?.date);
  const attendees = Array.isArray(event?.attendees) ? event.attendees : [];
  const attendeeEmails = attendees
    .map((person) => person?.email)
    .filter((email) => typeof email === "string" && email.length > 0);

  return {
    id: event.id || `event-${Math.random().toString(16).slice(2)}`,
    title: event.summary || "Untitled event",
    start,
    end,
    isAllDay,
    durationMinutes: start && end ? minutesBetween(start, end) : 0,
    location: event.location || "",
    description: event.description || "",
    htmlLink: event.htmlLink || "",
    attendeeEmails,
    attendeeCount: attendeeEmails.length,
    conferenceLink:
      event?.hangoutLink ||
      event?.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri ||
      ""
  };
}

export function sortEvents(events) {
  return [...events].sort((left, right) => left.start - right.start);
}

export function findFocusWindows(events, now = new Date()) {
  const startOfScan = new Date(now);
  startOfScan.setMinutes(Math.ceil(startOfScan.getMinutes() / 15) * 15, 0, 0);
  const endOfScan = new Date(now);
  endOfScan.setHours(20, 0, 0, 0);

  const windows = [];
  let cursor = startOfScan;

  for (const event of events) {
    if (event.end <= now || event.isAllDay) {
      continue;
    }

    const eventStart = event.start;
    if (minutesBetween(cursor, eventStart) >= 30) {
      windows.push({ start: new Date(cursor), end: new Date(eventStart), minutes: minutesBetween(cursor, eventStart) });
    }

    if (event.end > cursor) {
      cursor = new Date(event.end);
    }
  }

  if (minutesBetween(cursor, endOfScan) >= 30) {
    windows.push({ start: new Date(cursor), end: endOfScan, minutes: minutesBetween(cursor, endOfScan) });
  }

  return windows;
}

export function selectAnchorMeeting(events, now = new Date()) {
  const futureWithAttendees = events.find((event) => event.end > now && event.attendeeCount > 0);
  return futureWithAttendees || events.find((event) => event.end > now) || events[0] || null;
}

export function buildDayProfile(events, context = {}, now = new Date()) {
  const ordered = sortEvents(events);
  const timedEvents = ordered.filter((event) => event.start && event.end && !event.isAllDay);
  const totalMinutes = timedEvents.reduce((sum, event) => sum + event.durationMinutes, 0);
  const nextEvent = timedEvents.find((event) => event.end > now) || null;
  const focusWindows = findFocusWindows(timedEvents, now);
  const meetingLoad =
    timedEvents.length >= 6 || totalMinutes >= 300
      ? "heavy"
      : timedEvents.length >= 3 || totalMinutes >= 150
        ? "moderate"
        : "light";

  const energy = context.energy || "steady";
  const focusLength = Number(context.focusLength || 60);
  const recommendedFocusMinutes =
    energy === "low" ? Math.min(focusLength, 45) : energy === "high" ? Math.max(focusLength, 90) : focusLength;

  return {
    meetingLoad,
    totalMeetings: timedEvents.length,
    totalMinutes,
    nextEvent,
    focusWindows,
    recommendedFocusMinutes,
    anchorMeeting: selectAnchorMeeting(timedEvents, now),
    shouldProtectEnergy: energy === "low" || meetingLoad === "heavy",
    allDayCount: ordered.filter((event) => event.isAllDay).length
  };
}

export function pickBestFocusWindow(profile, context = {}) {
  const windows = profile.focusWindows || [];
  if (windows.length === 0) {
    return null;
  }

  const desiredMinutes = profile.recommendedFocusMinutes || Number(context.focusLength || 60);
  const eligible = windows.filter((window) => window.minutes >= desiredMinutes);
  const pool = eligible.length > 0 ? eligible : windows;

  if ((context.focusBias || "early") === "late") {
    return pool[pool.length - 1];
  }

  if (context.focusBias === "middle") {
    return pool[Math.floor(pool.length / 2)];
  }

  return pool[0];
}

export function createFocusBlockEvent(profile, context = {}, now = new Date()) {
  const chosenWindow = pickBestFocusWindow(profile, context);
  const length = profile.recommendedFocusMinutes || Number(context.focusLength || 60);
  const start = chosenWindow ? new Date(chosenWindow.start) : new Date(now.getTime() + 30 * MINUTE);
  const end = new Date(start.getTime() + length * MINUTE);
  const goal = context.goal?.trim() || "Protect time for the highest-priority task";

  return {
    summary: `Focus Block: ${goal}`,
    description: `Created by Orbit Assist.\n\nRole: ${context.role || "Not provided"}\nGoal: ${goal}\nMode: ${context.workStyle || "maker"}\nEnergy: ${context.energy || "steady"}`,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    reminders: { useDefault: true }
  };
}

export function buildLocalPlan({ profile, context }) {
  const priorityGoal = context.goal?.trim() || "make meaningful progress on the top task";
  const role = context.role?.trim() || "your role";
  const focusWindow = pickBestFocusWindow(profile, context);
  const focusLine = focusWindow
    ? `${formatTime(focusWindow.start)} to ${formatTime(focusWindow.end)}`
    : "after your next meeting";
  const diagnosis =
    profile.meetingLoad === "heavy"
      ? "The day is meeting-heavy, so progress will come from protecting small pockets of execution."
      : profile.meetingLoad === "moderate"
        ? "The day is balanced, which makes it realistic to pair meetings with one strong execution block."
        : "The calendar is relatively open, so this is a strong day for deep work and shipping.";

  const priorities = [
    `1. Protect your highest-value work for ${role}: ${priorityGoal}.`,
    profile.nextEvent
      ? `2. Use ${profile.nextEvent.title} as the anchor point, then resume execution immediately after it ends.`
      : "2. Batch small tasks quickly and keep most of your time for real progress.",
    profile.shouldProtectEnergy
      ? "3. Reduce context switching and avoid unnecessary new tasks."
      : "3. Push for completion while your calendar is still manageable."
  ];

  const risk = profile.shouldProtectEnergy
    ? "Running out of energy by reacting to every interruption."
    : "Letting meetings fragment the time you still have available.";

  return [
    `1. Diagnosis: ${diagnosis}`,
    `2. Priority moves:\n${priorities.join("\n")}`,
    `3. Focus block: ${focusLine} focused on ${priorityGoal}.`,
    `4. Risk to watch: ${risk}`,
    "5. Encouragement: Keep the plan simple and finish the next meaningful chunk."
  ].join("\n\n");
}

export function buildPlanPrompt({ events, profile, context, now = new Date() }) {
  const compactEvents = events
    .slice(0, 10)
    .map(
      (event) =>
        `- ${event.title} | ${formatEventRange(event)} | attendees=${event.attendeeCount} | location=${event.location || "n/a"}`
    )
    .join("\n");

  const windows = (profile.focusWindows || [])
    .slice(0, 4)
    .map((window) => `${formatTime(window.start)}-${formatTime(window.end)} (${window.minutes} mins)`)
    .join(", ");

  return `
You are Orbit Assist, a calm and practical productivity copilot.
Create a day plan for one real person using their Google Calendar plus context.

Current time: ${now.toISOString()}
Role: ${context.role || "Unknown"}
Top goal: ${context.goal || "Not provided"}
Energy: ${context.energy || "steady"}
Work style: ${context.workStyle || "maker"}
Meeting load: ${profile.meetingLoad}
Total meetings today: ${profile.totalMeetings}
Meeting minutes today: ${profile.totalMinutes}
Recommended focus minutes: ${profile.recommendedFocusMinutes}
Focus windows: ${windows || "none"}

Today's calendar:
${compactEvents || "- No events on calendar"}

Respond with:
1. A one-line diagnosis of the day
2. Three priority moves in order
3. One realistic focus block recommendation with time
4. One risk to watch
5. One short encouragement line

Keep it concise, concrete, and usable.
  `.trim();
}

export function buildFollowUpPrompt({ event, context, planText }) {
  return `
Write a professional but warm follow-up email draft after this meeting.

Meeting title: ${event?.title || "Meeting"}
Meeting time: ${event ? formatEventRange(event) : "Unknown"}
User role: ${context.role || "Unknown"}
User goal today: ${context.goal || "Not provided"}
Relevant notes from the assistant's day plan:
${planText || "No assistant plan available"}

Return plain text with:
Subject: ...
Body:
...
  `.trim();
}

export function extractRecipients(event) {
  return [...new Set(event?.attendeeEmails || [])];
}

export function buildFallbackFollowUp({ event, context }) {
  const subject = `Follow-up: ${event?.title || "our discussion"}`;
  const body = [
    "Hi team,",
    "",
    `Thanks for joining ${event?.title || "today's meeting"}.`,
    `My key focus from here is ${context.goal || "moving the work forward"}.`,
    "",
    "Next steps:",
    "- Share any missing inputs or blockers.",
    "- Confirm owners and timelines for open items.",
    "- Reply here if anything needs to be adjusted.",
    "",
    "Best,",
    context.role || "Orbit Assist user"
  ].join("\r\n");

  return { subject, body };
}

export function base64UrlEncode(input) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function buildDraftRaw({ to, subject, body }) {
  const lines = [
    `To: ${to.join(", ")}`,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
    `Subject: ${subject}`,
    "",
    body
  ];

  return base64UrlEncode(lines.join("\r\n"));
}

export function summarizeProfile(profile) {
  const nextMeeting = profile.nextEvent
    ? `Next: ${profile.nextEvent.title} at ${formatTime(profile.nextEvent.start)}`
    : "No more meetings today";

  return `${profile.meetingLoad} load, ${profile.totalMeetings} meetings, ${profile.totalMinutes} minutes booked. ${nextMeeting}.`;
}

export function stripMarkdown(value) {
  return value.replace(/^[-*]\s/gm, "").trim();
}
