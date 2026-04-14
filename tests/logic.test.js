import test from "node:test";
import assert from "node:assert/strict";
import {
  base64UrlEncode,
  buildDayProfile,
  buildDraftRaw,
  buildLocalPlan,
  buildFallbackFollowUp,
  createFocusBlockEvent,
  normalizeEvent,
  pickBestFocusWindow,
  selectAnchorMeeting,
  stripMarkdown
} from "../src/logic.js";

function event(summary, start, end, attendees = []) {
  return normalizeEvent({
    summary,
    start: { dateTime: start },
    end: { dateTime: end },
    attendees: attendees.map((email) => ({ email }))
  });
}

test("buildDayProfile detects meeting load and focus windows", () => {
  const now = new Date("2026-04-14T09:00:00.000Z");
  const events = [
    event("Standup", "2026-04-14T09:30:00.000Z", "2026-04-14T10:00:00.000Z", ["a@example.com"]),
    event("Review", "2026-04-14T11:00:00.000Z", "2026-04-14T12:30:00.000Z"),
    event("Planning", "2026-04-14T14:00:00.000Z", "2026-04-14T14:45:00.000Z")
  ];

  const profile = buildDayProfile(events, { energy: "steady", focusLength: 60 }, now);
  assert.equal(profile.meetingLoad, "moderate");
  assert.equal(profile.totalMeetings, 3);
  assert.equal(profile.focusWindows.length >= 2, true);
});

test("pickBestFocusWindow respects late bias", () => {
  const profile = {
    focusWindows: [
      { start: new Date("2026-04-14T10:00:00.000Z"), end: new Date("2026-04-14T11:00:00.000Z"), minutes: 60 },
      { start: new Date("2026-04-14T16:00:00.000Z"), end: new Date("2026-04-14T17:30:00.000Z"), minutes: 90 }
    ],
    recommendedFocusMinutes: 60
  };

  const window = pickBestFocusWindow(profile, { focusBias: "late" });
  assert.equal(window.minutes, 90);
});

test("createFocusBlockEvent builds a calendar insert payload", () => {
  const profile = {
    focusWindows: [
      { start: new Date("2026-04-14T13:00:00.000Z"), end: new Date("2026-04-14T15:00:00.000Z"), minutes: 120 }
    ],
    recommendedFocusMinutes: 90
  };

  const payload = createFocusBlockEvent(profile, { goal: "Ship challenge MVP", role: "Student builder" }, new Date("2026-04-14T09:00:00.000Z"));
  assert.match(payload.summary, /Ship challenge MVP/);
  assert.equal(payload.end.dateTime, "2026-04-14T14:30:00.000Z");
});

test("buildDraftRaw uses base64url-safe encoding", () => {
  const raw = buildDraftRaw({
    to: ["test@example.com"],
    subject: "Hello",
    body: "Body"
  });

  assert.equal(/[+/=]/.test(raw), false);
  assert.equal(base64UrlEncode("hello"), "aGVsbG8");
});

test("normalizeEvent extracts attendees and conference link", () => {
  const normalized = normalizeEvent({
    summary: "Sync",
    start: { dateTime: "2026-04-14T09:30:00.000Z" },
    end: { dateTime: "2026-04-14T10:00:00.000Z" },
    attendees: [{ email: "one@example.com" }, { email: "two@example.com" }],
    conferenceData: {
      entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }]
    }
  });

  assert.equal(normalized.attendeeCount, 2);
  assert.equal(normalized.conferenceLink, "https://meet.google.com/abc-defg-hij");
});

test("selectAnchorMeeting prefers upcoming meetings with attendees", () => {
  const now = new Date("2026-04-14T09:00:00.000Z");
  const events = [
    event("Solo work", "2026-04-14T09:15:00.000Z", "2026-04-14T10:00:00.000Z"),
    event("Team sync", "2026-04-14T10:30:00.000Z", "2026-04-14T11:00:00.000Z", ["teammate@example.com"])
  ];

  const anchor = selectAnchorMeeting(events, now);
  assert.equal(anchor.title, "Team sync");
});

test("buildLocalPlan returns actionable fallback guidance", () => {
  const profile = {
    meetingLoad: "moderate",
    nextEvent: { title: "Planning", start: new Date("2026-04-14T14:00:00.000Z") },
    focusWindows: [
      { start: new Date("2026-04-14T16:00:00.000Z"), end: new Date("2026-04-14T17:00:00.000Z"), minutes: 60 }
    ],
    recommendedFocusMinutes: 60,
    shouldProtectEnergy: false
  };

  const text = buildLocalPlan({
    profile,
    context: { goal: "Ship challenge MVP", role: "Builder", focusBias: "early" }
  });

  assert.match(text, /Ship challenge MVP/);
  assert.match(text, /Planning/);
});

test("buildFallbackFollowUp produces a subject and body", () => {
  const draft = buildFallbackFollowUp({
    event: { title: "Client review" },
    context: { goal: "Close feedback loop", role: "Founder" }
  });

  assert.match(draft.subject, /Client review/);
  assert.match(draft.body, /Close feedback loop/);
});

test("stripMarkdown removes list markers", () => {
  const text = stripMarkdown("- First item\n- Second item");
  assert.equal(text.includes("-"), false);
  assert.match(text, /First item/);
});
