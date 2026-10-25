import * as v from "valibot";
export const raceCases = Object.freeze([
  "C4/C5 returns one authorized order after racing and expiry",
  "reserves the last unit once, preserves the losing cart and releases on cancellation",
  "serializes pickup capacity and enforces variant quotas after cancellation",
  "serializes parallel payment delivery into one receipt and confirmation",
  "preserves unsigned/mode-mismatched events outside the trusted settlement path",
] as const);
const report = v.object({
  success: v.literal(true),
  numPassedTests: v.literal(5),
  numFailedTests: v.literal(0),
  testResults: v.array(
    v.object({
      assertionResults: v.array(
        v.object({
          title: v.string(),
          status: v.string(),
          duration: v.optional(
            v.nullable(v.pipe(v.number(), v.finite(), v.minValue(0))),
          ),
        }),
      ),
    }),
  ),
});
export function validateRaceEvidence(input: unknown) {
  const parsed = v.safeParse(report, input);
  if (!parsed.success) throw new Error("Incomplete bounded race evidence");
  const passed = parsed.output.testResults
    .flatMap((result) => result.assertionResults)
    .filter((result) => result.status === "passed");
  if (
    passed.length !== raceCases.length ||
    raceCases.some(
      (title) => passed.filter((result) => result.title === title).length !== 1,
    )
  )
    throw new Error("Incomplete bounded race evidence");
  return {
    scope: "bounded-use-case-races",
    cases: passed,
    note: "Separate owned PostgreSQL fixtures with fake providers; not load throughput or representative-fixture HTTP races.",
  };
}
