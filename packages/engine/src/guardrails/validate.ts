import Ajv, { type ValidateFunction } from "ajv";
import A from "../../../../shared/schemas/A.schema.json";
import B from "../../../../shared/schemas/B.schema.json";
import C from "../../../../shared/schemas/C.schema.json";
import D from "../../../../shared/schemas/D.schema.json";
import E from "../../../../shared/schemas/E.schema.json";
import G from "../../../../shared/schemas/G.schema.json";
import G2 from "../../../../shared/schemas/G2.schema.json";
import H from "../../../../shared/schemas/H.schema.json";
import I from "../../../../shared/schemas/I.schema.json";
import K from "../../../../shared/schemas/K.schema.json";
import P from "../../../../shared/schemas/P.schema.json";
import Q_classify from "../../../../shared/schemas/Q_classify.schema.json";
import Q_phrase from "../../../../shared/schemas/Q_phrase.schema.json";
import R from "../../../../shared/schemas/R.schema.json";
import T from "../../../../shared/schemas/T.schema.json";

export type SchemaId = "A" | "B" | "C" | "D" | "E" | "G" | "G2" | "H" | "I" | "K" | "P" | "Q_classify" | "Q_phrase" | "R" | "T";

/** The JSON Schemas in shared/schemas, keyed by id. */
export const schemas: Record<SchemaId, object> = { A, B, C, D, E, G, G2, H, I, K, P, Q_classify, Q_phrase, R, T };

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const ajv = new Ajv({ allErrors: true, strict: false });
const compiled = new WeakMap<object, ValidateFunction>();

/** Validate any value against a JSON Schema object, or against a bundled schema by id. */
export function validate(schema: object | SchemaId, value: unknown): ValidationResult {
  const schemaObj = typeof schema === "string" ? schemas[schema] : schema;
  if (!schemaObj || typeof schemaObj !== "object") return { valid: false, errors: ["unknown schema"] };
  let fn = compiled.get(schemaObj);
  if (!fn) {
    try {
      // Compile without registering the $id, so the same schema object can be passed again.
      const { $id: _ignored, ...rest } = schemaObj as Record<string, unknown>;
      fn = ajv.compile(rest);
    } catch (e) {
      return { valid: false, errors: [`invalid schema: ${(e as Error).message}`] };
    }
    compiled.set(schemaObj, fn);
  }
  const valid = fn(value) as boolean;
  const errors = valid ? [] : (fn.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`);
  return { valid, errors };
}

/** Parse model text as JSON; tolerates a fenced ```json block. Returns undefined when unparsable. */
export function parseJsonLoose(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) t = fence[1];
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}
