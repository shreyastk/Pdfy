// Feature: pdfy-feature-expansion, Property 32: ToolTemplate status is always exactly one of four states
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import fc from "fast-check";
import ToolTemplate from "@/components/ToolTemplate";
import type { ToolResult } from "@/lib/types";

/**
 * Property 32 (Validates: Requirements 15.4)
 *
 * ToolTemplate represents processing status using EXACTLY four mutually
 * exclusive states (idle, processing, success, error). At every observed point
 * the rendered DOM must reflect exactly one of those states — never two at
 * once — and the `idle` state must hide BOTH the processing-status region and
 * the result/download region.
 *
 * We test the real component (observable behavior): we render ToolTemplate with
 * a controllable `onRun` whose resolution/rejection is driven by fast-check, and
 * drive it through arbitrary sequences of user actions (select files, run with a
 * generated success/failure outcome). After each transition we assert the
 * four-state invariant on the actual DOM.
 */

// ---------------------------------------------------------------------------
// DOM state detection (positive markers unique to each state's status block)
// ---------------------------------------------------------------------------
//   processing -> the animated spinner (`.animate-spin`)
//   error      -> the red error block (`.bg-red-50`)
//   success    -> the result/download region's "Download" button (onRun always
//                 resolves with >=1 download, so this is present iff success)
//   idle       -> none of the above are present (status + result hidden)

type StateName = "idle" | "processing" | "success" | "error";

function detectStates(container: HTMLElement) {
  const processing = !!container.querySelector(".animate-spin");
  const error = !!container.querySelector(".bg-red-50");
  const success = Array.from(container.querySelectorAll("button")).some(
    (b) => b.textContent?.trim() === "Download",
  );
  return { processing, error, success };
}

function assertExactlyOneState(container: HTMLElement, expected: StateName) {
  const s = detectStates(container);
  const activeCount = [s.processing, s.error, s.success].filter(Boolean).length;

  // The invariant: never two (or more) states simultaneously.
  expect(activeCount).toBeLessThanOrEqual(1);

  if (expected === "idle") {
    // idle hides the status region AND the result/download region (Req 15.4).
    expect(activeCount).toBe(0);
  } else {
    // exactly one of the non-idle states is active, and it is the expected one.
    expect(activeCount).toBe(1);
    expect(s[expected]).toBe(true);
  }
}

function makeFile(i: number): File {
  return new File([new Uint8Array([1, 2, 3])], `f${i}.pdf`, {
    type: "application/pdf",
  });
}

const SUCCESS_RESULT: ToolResult = {
  downloads: [{ filename: "out.pdf", data: new Uint8Array([4, 5, 6]) }],
};

// Generated action sequence: either select N files, or run with an outcome.
type Action =
  | { type: "select"; count: number }
  | { type: "run"; outcome: "success" | "failure" };

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  fc.record({
    type: fc.constant("select" as const),
    count: fc.integer({ min: 0, max: 3 }),
  }),
  fc.record({
    type: fc.constant("run" as const),
    outcome: fc.constantFrom("success" as const, "failure" as const),
  }),
);

afterEach(() => {
  cleanup();
});

describe("ToolTemplate status four-state invariant (Property 32)", () => {
  it("is always in exactly one of {idle, processing, success, error} after every action", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(actionArb, { minLength: 1, maxLength: 6 }),
        async (actions) => {
          // A deferred onRun so we can observe the `processing` state and then
          // drive the terminal (success/error) outcome deterministically.
          let resolveRun: ((r: ToolResult) => void) | null = null;
          let rejectRun: ((e: Error) => void) | null = null;

          const onRun = (): Promise<ToolResult> =>
            new Promise<ToolResult>((resolve, reject) => {
              resolveRun = resolve;
              rejectRun = reject;
            });

          const { container, unmount } = render(
            <ToolTemplate
              title="Test Tool"
              description="A tool for testing"
              onRun={onRun}
            />,
          );

          try {
            // Initial render must be idle (status + result hidden).
            assertExactlyOneState(container, "idle");

            let selectedCount = 0;

            for (const action of actions) {
              if (action.type === "select") {
                const input = container.querySelector(
                  'input[type="file"]',
                ) as HTMLInputElement;
                const files = Array.from({ length: action.count }, (_, i) =>
                  makeFile(i),
                );
                await act(async () => {
                  fireEvent.change(input, { target: { files } });
                });
                selectedCount = action.count;
                // Selecting files always resets back to idle.
                assertExactlyOneState(container, "idle");
              } else {
                const runButton = Array.from(
                  container.querySelectorAll("button"),
                ).find((b) => {
                  const t = b.textContent?.trim();
                  return t === "Run" || t === "Processing...";
                }) as HTMLButtonElement;

                if (selectedCount === 0) {
                  // No files selected -> synchronous validation error, onRun
                  // is never invoked.
                  await act(async () => {
                    fireEvent.click(runButton);
                  });
                  assertExactlyOneState(container, "error");
                } else {
                  // Files selected -> enters processing, then resolves/rejects.
                  await act(async () => {
                    fireEvent.click(runButton);
                  });
                  assertExactlyOneState(container, "processing");

                  if (action.outcome === "success") {
                    await act(async () => {
                      resolveRun?.(SUCCESS_RESULT);
                    });
                    assertExactlyOneState(container, "success");
                  } else {
                    await act(async () => {
                      rejectRun?.(new Error("boom"));
                    });
                    assertExactlyOneState(container, "error");
                  }
                }
              }
            }
          } finally {
            unmount();
          }
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);
});
