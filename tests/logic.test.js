import test from "node:test";
import assert from "node:assert/strict";
import {
  base64UrlEncode,
  buildDayProfile,
  buildDraftRaw,
  createFocusBlockEvent,
  normalizeEvent,
  pickBestFocusWindow
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
