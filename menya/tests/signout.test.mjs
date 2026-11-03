import { test } from "node:test";
import assert from "node:assert/strict";
import { authMethod, clearAccountData, endSession, initialsOf } from "../src/lib/signout.js";
import { historyToMessages } from "../src/lib/chat.js";

function fakeStorage(entries) {
  const m = new Map(Object.entries(entries));
  return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, removeItem: k => m.delete(k), has: k => m.has(k) };
}
const account = () => ({ "sb-tgrihnmngbamxxjnedlc-auth-token": "{token}", menya_current: "session-id", menya_guest_ticket: "t", menya_onboarded: "1", menya_invite: "i", menya_settings: "{theme}", menya_intro_seen: "1" });

test("signing out clears everything tied to the account and keeps device preferences", () => {
  const local = fakeStorage(account()), session = fakeStorage({ menya_current: "x" });
  clearAccountData([local, session, null]);
  for (const k of ["sb-tgrihnmngbamxxjnedlc-auth-token", "menya_current", "menya_guest_ticket", "menya_onboarded", "menya_invite"]) assert.equal(local.has(k), false, k);
  assert.equal(session.has("menya_current"), false);
  assert.equal(local.has("menya_settings"), true);
});

test("the server is told first; one device by default, every device on request", async () => {
  const scopes = [];
  const auth = { signOut: async ({ scope }) => { scopes.push(scope); return { error: null }; } };
  assert.equal(await endSession(auth, []), true);
  assert.equal(await endSession(auth, [], { everywhere: true }), true);
  assert.deepEqual(scopes, ["local", "global"]);
});

test("no connection: this browser is still cleared, and the caller is told", async () => {
  const local = fakeStorage(account());
  for (const auth of [{ signOut: async () => ({ error: new Error("offline") }) }, { signOut: async () => { throw new Error("offline"); } }]) {
    assert.equal(await endSession(auth, [local]), false);
    assert.equal(local.has("sb-tgrihnmngbamxxjnedlc-auth-token"), false);
  }
});

test("blocked storage doesn't stop a sign-out", () => {
  assert.doesNotThrow(() => clearAccountData([{ get length() { throw new Error("blocked"); } }]));
});

test("initials and sign-in method", () => {
  assert.equal(initialsOf("Aline Uwase"), "AU");
  assert.equal(initialsOf("Aline"), "A");
  assert.equal(initialsOf("", "x@y.z"), "X");
  assert.equal(initialsOf("", ""), "?");
  assert.equal(authMethod({ app_metadata: { provider: "google" } }), "google");
  assert.equal(authMethod({ app_metadata: { provider: "email" } }), "email");
  assert.equal(authMethod({ is_anonymous: true }), "guest");
  assert.equal(authMethod({}), "other");
});

test("a saved conversation keeps its references", () => {
  const research = { status: "ok", sources: [{ url: "https://doi.org/10.1000/x", apa: "A. (2020). B." }], further: [] };
  const [m] = historyToMessages([{ role: "assistant", id: 1, content: "x", meta: { research } }]);
  assert.deepEqual(m.research, research);
  assert.equal(historyToMessages([{ role: "assistant", id: 2, content: "y", meta: {} }])[0].research, null);
});
