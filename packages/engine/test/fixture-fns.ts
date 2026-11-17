import { selfAudit } from "../src/audit";
import { robustZ } from "../src/baseline";
import { maskedDomains } from "../src/context";
import { computeFeatures } from "../src/features/index";
import { scoreFromZ } from "../src/index-score";
import { dailyUpdate } from "../src/state";
import { haversine, mad, mean, median, quantile, sd } from "../src/stats";

// Functions covered by the golden fixtures. Each fixture is { fn, input, expectedOutput }
// where `input` is the argument list. The iOS bridge runs the same files through engine.js.
/* eslint-disable @typescript-eslint/no-explicit-any */
export const FIXTURE_FNS: Record<string, (...args: any[]) => unknown> = {
  mean, sd, median, mad, quantile, haversine, robustZ, computeFeatures, scoreFromZ, maskedDomains, dailyUpdate, selfAudit,
};
