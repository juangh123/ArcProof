import { expect, test } from "@playwright/test";

// Temporary probe: fails on purpose so the CI failure-artifact upload step is
// exercised end to end. Deleted with the probe branch.
test("failure probe", async () => {
  expect(1).toBe(2);
});
