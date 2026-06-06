import { describe, expect, test } from "vitest";
import { findPortForSession, getWorkspacePathForPort } from "./session-routing.js";

describe("session routing helpers", () => {
  const instances = [
    { port: 47821, sessionFile: "/tmp/session-a.jsonl", cwd: "/tmp/a" },
    { port: 47822, sessionFile: "/tmp/session-b.jsonl", cwd: "/tmp/b" },
  ];

  test("resolves the active pi process by selected session file", () => {
    expect(findPortForSession(instances, "/tmp/session-b.jsonl", 47821)).toBe(47822);
  });

  test("resolves workspace path from the active pi process port", () => {
    expect(getWorkspacePathForPort(instances, 47822)).toBe("/tmp/b");
  });
});
