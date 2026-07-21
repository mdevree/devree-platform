import { createHash } from "node:crypto";

export type SourceConflictStatus = "unresolved" | "conflict" | "confirmed";
export type SourceValue = string | number | boolean | null;

export interface SourceReference {
  type: string;
  document?: string;
  path?: string;
  page?: number;
  field?: string;
  uri?: string;
  extract?: string;
}

export interface SourceObservationInput {
  id?: string;
  value: SourceValue;
  unit?: string;
  source: SourceReference;
  observedAt?: string;
}

export interface SourceObservation extends SourceObservationInput {
  id: string;
  normalizedValue: SourceValue;
  recordedAt: string;
  recordedBy: string;
}

export type ConflictRule =
  | { type: "exact" }
  | { type: "text"; caseSensitive?: boolean }
  | { type: "number"; absoluteTolerance?: number; relativeTolerance?: number; integer?: boolean }
  | { type: "date" }
  | { type: "boolean" };

export interface PropagationTarget {
  path: string;
  value: "confirmed" | SourceValue;
  export?: boolean;
}

export interface SourceFieldDefinition {
  key: string;
  label: string;
  dataType: "string" | "number" | "boolean" | "date";
  unit?: string;
  rule: ConflictRule;
  targets: PropagationTarget[];
}

export interface TaxateurConfirmation {
  active: boolean;
  value: SourceValue;
  normalizedValue: SourceValue;
  method: "source" | "manual";
  sourceValueId?: string;
  confirmedBy: string;
  confirmedAt: string;
  note?: string;
  invalidatedAt?: string;
  invalidatedReason?: string;
}

export interface SourceFieldState {
  key: string;
  label: string;
  dataType: SourceFieldDefinition["dataType"];
  unit?: string;
  rule: ConflictRule;
  targets: PropagationTarget[];
  sourceValues: SourceObservation[];
  status: SourceConflictStatus;
  distinctValues: SourceValue[];
  taxateur_bevestigd: TaxateurConfirmation | null;
  lastEvaluatedAt: string;
}

export interface SourceValidationBlock {
  schemaVersion: "1.0";
  fields: Record<string, SourceFieldState>;
  openConflicts: string[];
  unresolvedFields: string[];
  lastValidatedAt: string;
}

export interface AuditEvent {
  timestamp: string;
  actor: string;
  action: string;
  field?: string;
  details?: Record<string, unknown>;
}

export interface TaxatieDossier extends Record<string, unknown> {
  bronwaarde_validatie?: SourceValidationBlock;
  audit_log?: AuditEvent[];
}

export interface MutationContext {
  actor: string;
  now?: string;
}

export const SOURCE_FIELD_DEFINITIONS: Record<string, SourceFieldDefinition> = {
  zonnepanelen_vermogen_wp: {
    key: "zonnepanelen_vermogen_wp",
    label: "Opgesteld vermogen zonnepanelen",
    dataType: "number",
    unit: "Wp",
    rule: { type: "number", absoluteTolerance: 0, integer: true },
    targets: [
      { path: "object.zonnepanelen.vermogen_wp", value: "confirmed" },
      { path: "energetische_opnamestaat.items.24.aanwezig", value: 1, export: true },
      { path: "energetische_opnamestaat.items.24.aantal_of_wattpiek_type", value: 0, export: true },
      { path: "energetische_opnamestaat.items.24.aantal_of_wattpiek", value: "confirmed", export: true },
      { path: "exports.bevestigde_bronwaarden.zonnepanelen_vermogen_wp", value: "confirmed", export: true },
    ],
  },
};

function nowIso(context: MutationContext) {
  return context.now || new Date().toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeNumber(value: SourceValue, integer = false): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (integer && !Number.isInteger(value)) throw new Error(`Waarde ${value} moet een geheel getal zijn`);
    return value;
  }
  if (typeof value !== "string" || !value.trim()) throw new Error(`Waarde ${String(value)} is geen geldig getal`);

  let cleaned = value.trim().replace(/\s/g, "").replace(/[^0-9,.-]/g, "");
  if (integer) {
    cleaned = cleaned.replace(/[.,](?=\d{3}(?:\D|$))/g, "");
  } else if (cleaned.includes(",") && cleaned.includes(".")) {
    cleaned = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (cleaned.includes(",")) {
    cleaned = cleaned.replace(",", ".");
  }
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed))) {
    throw new Error(`Waarde ${value} is geen geldig${integer ? " geheel" : ""} getal`);
  }
  return parsed;
}

export function normalizeSourceValue(value: SourceValue, rule: ConflictRule): SourceValue {
  if (value === null) throw new Error("Een bronwaarde mag niet null zijn");
  switch (rule.type) {
    case "number":
      return normalizeNumber(value, rule.integer);
    case "text": {
      const text = String(value).trim().replace(/\s+/g, " ");
      if (!text) throw new Error("Een tekstwaarde mag niet leeg zijn");
      return rule.caseSensitive ? text : text.toLocaleLowerCase("nl-NL");
    }
    case "date": {
      const raw = String(value).trim();
      const dutchDate = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      const normalizedInput = dutchDate ? `${dutchDate[3]}-${dutchDate[2]}-${dutchDate[1]}` : raw;
      const date = new Date(`${normalizedInput}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime())) throw new Error(`Waarde ${String(value)} is geen geldige datum`);
      const normalized = date.toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedInput) || normalized !== normalizedInput) {
        throw new Error(`Waarde ${String(value)} is geen geldige datum`);
      }
      return normalized;
    }
    case "boolean":
      if (typeof value === "boolean") return value;
      if (["true", "ja", "1"].includes(String(value).trim().toLowerCase())) return true;
      if (["false", "nee", "0"].includes(String(value).trim().toLowerCase())) return false;
      throw new Error(`Waarde ${String(value)} is geen geldige boolean`);
    case "exact":
      return value;
  }
}

export function sourceValuesEqual(left: SourceValue, right: SourceValue, rule: ConflictRule): boolean {
  const a = normalizeSourceValue(left, rule);
  const b = normalizeSourceValue(right, rule);
  if (rule.type !== "number") return a === b;

  const leftNumber = a as number;
  const rightNumber = b as number;
  const absoluteDifference = Math.abs(leftNumber - rightNumber);
  if (absoluteDifference <= (rule.absoluteTolerance || 0)) return true;
  const denominator = Math.max(Math.abs(leftNumber), Math.abs(rightNumber), 1);
  return absoluteDifference / denominator <= (rule.relativeTolerance || 0);
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  const record = asRecord(value);
  if (record) {
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableValue(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function observationId(fieldKey: string, input: SourceObservationInput) {
  return createHash("sha256")
    .update(stableValue({ fieldKey, value: input.value, unit: input.unit, source: input.source, observedAt: input.observedAt }))
    .digest("hex")
    .slice(0, 24);
}

function appendAudit(dossier: TaxatieDossier, event: AuditEvent) {
  if (!Array.isArray(dossier.audit_log)) dossier.audit_log = [];
  dossier.audit_log.push(event);
}

function ensureValidationBlock(dossier: TaxatieDossier, timestamp: string): SourceValidationBlock {
  const current = asRecord(dossier.bronwaarde_validatie);
  if (!current || current.schemaVersion !== "1.0" || !asRecord(current.fields)) {
    dossier.bronwaarde_validatie = {
      schemaVersion: "1.0",
      fields: {},
      openConflicts: [],
      unresolvedFields: [],
      lastValidatedAt: timestamp,
    };
  }
  return dossier.bronwaarde_validatie as SourceValidationBlock;
}

function ensureField(block: SourceValidationBlock, definition: SourceFieldDefinition, timestamp: string): SourceFieldState {
  const existing = block.fields[definition.key];
  if (existing) {
    existing.label = definition.label;
    existing.dataType = definition.dataType;
    existing.unit = definition.unit;
    existing.rule = definition.rule;
    existing.targets = definition.targets;
    if (!Array.isArray(existing.sourceValues)) existing.sourceValues = [];
    return existing;
  }
  const field: SourceFieldState = {
    key: definition.key,
    label: definition.label,
    dataType: definition.dataType,
    unit: definition.unit,
    rule: definition.rule,
    targets: definition.targets,
    sourceValues: [],
    status: "unresolved",
    distinctValues: [],
    taxateur_bevestigd: null,
    lastEvaluatedAt: timestamp,
  };
  block.fields[definition.key] = field;
  return field;
}

function distinctNormalizedValues(observations: SourceObservation[], rule: ConflictRule): SourceValue[] {
  const distinct: SourceValue[] = [];
  for (const observation of observations) {
    if (!distinct.some((value) => sourceValuesEqual(value, observation.normalizedValue, rule))) {
      distinct.push(observation.normalizedValue);
    }
  }
  return distinct;
}

function refreshBlock(block: SourceValidationBlock, timestamp: string) {
  block.openConflicts = Object.values(block.fields)
    .filter((field) => field.status === "conflict")
    .map((field) => field.key);
  block.unresolvedFields = Object.values(block.fields)
    .filter((field) => field.status === "unresolved")
    .map((field) => field.key);
  block.lastValidatedAt = timestamp;
}

function reevaluateField(field: SourceFieldState, timestamp: string) {
  field.distinctValues = distinctNormalizedValues(field.sourceValues, field.rule);
  const confirmation = field.taxateur_bevestigd;
  if (confirmation?.active) {
    const laterConflict = field.sourceValues.some((observation) =>
      observation.recordedAt > confirmation.confirmedAt &&
      !sourceValuesEqual(observation.normalizedValue, confirmation.normalizedValue, field.rule)
    );
    if (laterConflict) {
      confirmation.active = false;
      confirmation.invalidatedAt = timestamp;
      confirmation.invalidatedReason = "Na de bevestiging is een nieuwe afwijkende bronwaarde geregistreerd";
    }
  }
  field.status = field.taxateur_bevestigd?.active
    ? "confirmed"
    : field.distinctValues.length > 1
      ? "conflict"
      : "unresolved";
  field.lastEvaluatedAt = timestamp;
}

export function getSourceFieldDefinition(fieldKey: string): SourceFieldDefinition {
  const definition = SOURCE_FIELD_DEFINITIONS[fieldKey];
  if (!definition) throw new Error(`Onbekend bronveld: ${fieldKey}`);
  return definition;
}

export function registerSourceObservation(
  dossier: TaxatieDossier,
  fieldKey: string,
  input: SourceObservationInput,
  context: MutationContext
): { dossier: TaxatieDossier; field: SourceFieldState; created: boolean } {
  const timestamp = nowIso(context);
  const definition = getSourceFieldDefinition(fieldKey);
  const normalizedValue = normalizeSourceValue(input.value, definition.rule);
  if (input.unit && definition.unit && input.unit.toLowerCase() !== definition.unit.toLowerCase()) {
    throw new Error(`Eenheid ${input.unit} past niet bij ${definition.unit} voor ${fieldKey}`);
  }
  const block = ensureValidationBlock(dossier, timestamp);
  const field = ensureField(block, definition, timestamp);
  const id = input.id || observationId(fieldKey, input);
  const existing = field.sourceValues.find((value) => value.id === id);
  if (existing) {
    if (!sourceValuesEqual(existing.normalizedValue, normalizedValue, definition.rule)) {
      throw new Error(`Bronwaarde-id ${id} bestaat al met een andere waarde`);
    }
    reevaluateField(field, timestamp);
    refreshBlock(block, timestamp);
    return { dossier, field, created: false };
  }

  const previousStatus = field.status;
  field.sourceValues.push({
    ...input,
    id,
    unit: input.unit || definition.unit,
    normalizedValue,
    observedAt: input.observedAt || timestamp,
    recordedAt: timestamp,
    recordedBy: context.actor,
  });
  const wasConfirmed = field.taxateur_bevestigd?.active === true;
  reevaluateField(field, timestamp);
  refreshBlock(block, timestamp);
  appendAudit(dossier, {
    timestamp,
    actor: context.actor,
    action: "source_value_registered",
    field: fieldKey,
    details: {
      sourceValueId: id,
      value: input.value,
      normalizedValue,
      source: input.source,
      previousStatus,
      status: field.status,
    },
  });
  if (wasConfirmed && field.status !== "confirmed") {
    const clearedTargets = definition.targets
      .filter((target) => target.value === "confirmed")
      .map((target) => ({ path: target.path, from: setAtPath(dossier, target.path, null), to: null }));
    appendAudit(dossier, {
      timestamp,
      actor: "systeem",
      action: "taxateur_confirmation_invalidated",
      field: fieldKey,
      details: {
        reason: field.taxateur_bevestigd?.invalidatedReason,
        triggerSourceValueId: id,
        clearedTargets,
      },
    });
  }
  return { dossier, field, created: true };
}

function setAtPath(root: Record<string, unknown>, path: string, value: SourceValue) {
  const parts = path.split(".").filter(Boolean);
  if (!parts.length) throw new Error("Doelpad mag niet leeg zijn");
  let cursor = root;
  for (const part of parts.slice(0, -1)) {
    const next = asRecord(cursor[part]);
    if (next) {
      cursor = next;
    } else {
      const created: Record<string, unknown> = {};
      cursor[part] = created;
      cursor = created;
    }
  }
  const leaf = parts.at(-1) as string;
  const previous = cursor[leaf];
  cursor[leaf] = value;
  return previous;
}

export function confirmSourceValue(
  dossier: TaxatieDossier,
  fieldKey: string,
  selection: { sourceValueId: string } | { manualValue: SourceValue },
  context: MutationContext & { note?: string }
): { dossier: TaxatieDossier; field: SourceFieldState; propagated: Array<{ path: string; from: unknown; to: SourceValue }> } {
  const timestamp = nowIso(context);
  const definition = getSourceFieldDefinition(fieldKey);
  const block = ensureValidationBlock(dossier, timestamp);
  const field = ensureField(block, definition, timestamp);

  let value: SourceValue;
  let method: TaxateurConfirmation["method"];
  let sourceValueId: string | undefined;
  if ("sourceValueId" in selection) {
    const sourceValue = field.sourceValues.find((observation) => observation.id === selection.sourceValueId);
    if (!sourceValue) throw new Error(`Bronwaarde ${selection.sourceValueId} niet gevonden voor ${fieldKey}`);
    value = sourceValue.value;
    method = "source";
    sourceValueId = sourceValue.id;
  } else {
    value = selection.manualValue;
    method = "manual";
  }
  const normalizedValue = normalizeSourceValue(value, definition.rule);
  field.taxateur_bevestigd = {
    active: true,
    value: normalizedValue,
    normalizedValue,
    method,
    sourceValueId,
    confirmedBy: context.actor,
    confirmedAt: timestamp,
    note: context.note,
  };
  field.status = "confirmed";
  field.lastEvaluatedAt = timestamp;
  const propagated = definition.targets.map((target) => {
    const next = target.value === "confirmed" ? normalizedValue : target.value;
    const previous = setAtPath(dossier, target.path, next);
    return { path: target.path, from: previous, to: next };
  });
  refreshBlock(block, timestamp);
  appendAudit(dossier, {
    timestamp,
    actor: context.actor,
    action: "source_value_confirmed",
    field: fieldKey,
    details: { method, sourceValueId, value: normalizedValue, note: context.note, propagated },
  });
  return { dossier, field, propagated };
}

export function sourceValidationSummary(dossier: TaxatieDossier) {
  const block = dossier.bronwaarde_validatie;
  if (!block) return { fields: [], openConflicts: [], unresolvedFields: [], exportReady: true };
  const fields = Object.values(block.fields).map((field) => ({
    key: field.key,
    label: field.label,
    dataType: field.dataType,
    unit: field.unit,
    status: field.status,
    sourceValues: field.sourceValues,
    distinctValues: field.distinctValues,
    taxateur_bevestigd: field.taxateur_bevestigd,
    lastEvaluatedAt: field.lastEvaluatedAt,
  }));
  return {
    fields,
    openConflicts: block.openConflicts,
    unresolvedFields: block.unresolvedFields,
    exportReady: block.openConflicts.length === 0 && block.unresolvedFields.length === 0,
  };
}

export function assertSourceValuesReadyForExport(dossier: TaxatieDossier) {
  const summary = sourceValidationSummary(dossier);
  if (!summary.exportReady) {
    const fields = [...summary.openConflicts, ...summary.unresolvedFields];
    throw new Error(`Export geblokkeerd: bevestig eerst de bronwaarde(n) ${fields.join(", ")}`);
  }
  return dossier;
}
