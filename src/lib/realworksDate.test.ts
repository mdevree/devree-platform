import assert from "node:assert/strict";
import test from "node:test";
import { parseRwDate } from "./realworksDate";

test("Realworks winter appointments retain the actual local time", () => {
  assert.equal(parseRwDate("03-11-2026 09:15:00")?.toISOString(), "2026-11-03T08:15:00.000Z");
  assert.equal(parseRwDate("03-11-2026 16:15:00")?.toISOString(), "2026-11-03T15:15:00.000Z");
  assert.equal(parseRwDate("01-01-2027 00:30:00")?.toISOString(), "2026-12-31T23:30:00.000Z");
});
test("summer and both DST transitions use Amsterdam rules", () => {
  for (const [input, expected] of [
    ["01-07-2026 09:15:00", "2026-07-01T07:15:00.000Z"],
    ["29-03-2026 01:30:00", "2026-03-29T00:30:00.000Z"],
    ["29-03-2026 03:30:00", "2026-03-29T01:30:00.000Z"],
    ["25-10-2026 01:30:00", "2026-10-24T23:30:00.000Z"],
    ["25-10-2026 02:30:00", "2026-10-25T00:30:00.000Z"],
    ["25-10-2026 03:30:00", "2026-10-25T02:30:00.000Z"],
  ]) assert.equal(parseRwDate(input)?.toISOString(), expected);
});
test("missing, malformed and nonexistent dates are rejected", () => {
  for (const input of [undefined, "", "bad", "31-02-2026 09:00:00", "03-11-2026 25:00:00", "29-03-2026 02:30:00"])
    assert.equal(parseRwDate(input), null);
});
