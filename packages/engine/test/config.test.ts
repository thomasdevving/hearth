import { describe, expect, it } from "vitest";
import defaults from "../../../shared/config/defaults.json";
import template from "../../../firebase/remoteconfig.template.json";
import { defaultConfig, loadConfig, loadConfigWithReport } from "../src/config";

describe("config", () => {
  it("defaults are the bundled file", () => {
    expect(loadConfig()).toEqual(defaults);
    expect(loadConfig({})).toEqual(defaults);
    expect(defaultConfig).toEqual(defaults);
  });
  it("merges valid overrides", () => {
    const cfg = loadConfig({ ewmaL: 3, ctxMinConf: "high", phone: { enabled: true, thresholds: [0, 60] } });
    expect(cfg.ewmaL).toBe(3);
    expect(cfg.ctxMinConf).toBe("high");
    expect(cfg.phone).toEqual({ enabled: true, thresholds: [0, 60] });
    expect(cfg.cusumH).toBe(4);
  });
  it("an invalid value falls back to its default", () => {
    const { config, rejected } = loadConfigWithReport({
      ewmaLambda: 7, // out of range
      minReferenceDays: "14", // wrong type
      maxCheckinsPerDay: 1.5, // not an integer
      quietHours: "late",
      phone: { enabled: "yes" },
      nonsense: 1,
    });
    expect(config).toEqual(defaults);
    expect(rejected.sort()).toEqual(["ewmaLambda", "maxCheckinsPerDay", "minReferenceDays", "nonsense", "phone", "quietHours"]);
  });
  it("featureFloors merge key by key", () => {
    const { config, rejected } = loadConfigWithReport({ featureFloors: { steps: 500, walking_speed: -1 } });
    expect(config.featureFloors.steps).toBe(500);
    expect(config.featureFloors.walking_speed).toBe(0.03);
    expect(config.featureFloors.rest_midpoint).toBe(15);
    expect(rejected).toEqual(["featureFloors.walking_speed"]);
  });
  it("non-object overrides are ignored", () => {
    expect(loadConfig(null)).toEqual(defaults);
    expect(loadConfig("x")).toEqual(defaults);
    expect(loadConfig([1, 2])).toEqual(defaults);
  });
  it("does not mutate the defaults", () => {
    const cfg = loadConfig();
    cfg.featureFloors.steps = 1;
    expect(loadConfig().featureFloors.steps).toBe(300);
  });
  it("the Remote Config template has exactly the config keys and the same values", () => {
    const params = (template as { parameters: Record<string, { defaultValue: { value: string }; valueType: string }> }).parameters;
    expect(Object.keys(params).sort()).toEqual(Object.keys(defaults).sort());
    const fromTemplate: Record<string, unknown> = {};
    for (const [k, p] of Object.entries(params)) {
      fromTemplate[k] = p.valueType === "NUMBER" ? Number(p.defaultValue.value) : p.valueType === "JSON" ? JSON.parse(p.defaultValue.value) : p.defaultValue.value;
    }
    expect(loadConfigWithReport(fromTemplate)).toEqual({ config: defaults, rejected: [] });
  });
});
