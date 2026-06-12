import { describe, expect, test, vi } from "vitest";
import { anchorHistoryToBottom } from "./history-scroll-anchor.js";

describe("anchorHistoryToBottom", () => {
  test("re-anchors to latest scrollHeight across delayed layout shifts", () => {
    const messagesEl = {
      scrollTop: 0,
      scrollHeight: 120,
      style: { scrollBehavior: "smooth" },
    };

    const timeouts = [];
    const requestAnimationFrame = vi.fn((cb) => {
      cb();
      return 1;
    });
    const setTimeoutFn = vi.fn((cb, ms) => {
      timeouts.push({ cb, ms });
      return timeouts.length;
    });

    anchorHistoryToBottom(messagesEl, {
      requestAnimationFrame,
      setTimeout: setTimeoutFn,
      settleDelayMs: 80,
      settlePasses: 2,
    });

    // immediate anchor
    expect(messagesEl.scrollTop).toBe(120);
    expect(messagesEl.style.scrollBehavior).toBe("");

    // first layout shift before first timeout flushes
    messagesEl.scrollHeight = 380;
    timeouts[0].cb();
    expect(messagesEl.scrollTop).toBe(380);

    // second layout shift before second timeout flushes
    messagesEl.scrollHeight = 620;
    timeouts[1].cb();
    expect(messagesEl.scrollTop).toBe(620);
  });
});
