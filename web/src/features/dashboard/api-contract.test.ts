import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type JsonObject = { [key: string]: unknown };

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function object(value: unknown, label: string): JsonObject {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
  return value;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function equal(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch`);
  }
}

function schema(contract: JsonObject, name: string): JsonObject {
  const components = object(contract.components, "components");
  return object(object(components.schemas, "schemas")[name], `schema ${name}`);
}

function dereference(contract: JsonObject, value: unknown): JsonObject {
  const candidate = object(value, "schema property");
  const reference = candidate.$ref;
  if (typeof reference !== "string") return candidate;
  const prefix = "#/components/schemas/";
  if (!reference.startsWith(prefix)) throw new Error("unsupported schema reference");
  return schema(contract, reference.slice(prefix.length));
}

function parameter(operation: JsonObject, name: string): JsonObject {
  const parameters = array(operation.parameters, "parameters");
  const found = parameters.find((entry) => isObject(entry) && entry.name === name);
  return object(found, `parameter ${name}`);
}

function response(operation: JsonObject, status: string): JsonObject {
  return object(object(operation.responses, "responses")[status], `response ${status}`);
}

function responseContent(operation: JsonObject, status: string): JsonObject {
  return object(response(operation, status).content, `response ${status} content`);
}

function requireResponse(
  operation: JsonObject,
  status: string,
  mediaType: string,
  schemaName: string,
): void {
  const content = responseContent(operation, status);
  const media = object(content[mediaType], `${status} ${mediaType}`);
  const responseSchema = object(media.schema, `${status} schema`);
  equal(responseSchema.$ref, `#/components/schemas/${schemaName}`, `${status} ${mediaType} schema`);
}

function requireSchemaProperty(
  contract: JsonObject,
  schemaName: string,
  propertyName: string,
  expected: JsonObject,
): void {
  const target = schema(contract, schemaName);
  const properties = object(target.properties, `${schemaName}.properties`);
  const property = dereference(contract, properties[propertyName]);
  for (const [key, value] of Object.entries(expected)) equal(property[key], value, `${schemaName}.${propertyName}.${key}`);
}

function validateCompatibility(input: unknown): void {
  const contract = object(input, "contract");
  equal(contract.openapi, "3.0.3", "OpenAPI version");
  const paths = object(contract.paths, "paths");
  const expectedPaths = [
    "/anomalies", "/dashboard/summary", "/health", "/market/{symbol}/health",
    "/market/{symbol}/state", "/market/{symbol}/timeline", "/pipeline/health",
    "/runtime/mode", "/symbols",
  ];
  equal(Object.keys(paths).sort(), expectedPaths, "endpoint paths");
  const operationAt = (path: string, method: string) => object(object(paths[path], path)[method], `${method} ${path}`);
  const runtimeGet = operationAt("/runtime/mode", "get");
  const runtimePost = operationAt("/runtime/mode", "post");
  const dashboard = operationAt("/dashboard/summary", "get");
  const timeline = operationAt("/market/{symbol}/timeline", "get");
  const anomalies = operationAt("/anomalies", "get");
  const state = operationAt("/market/{symbol}/state", "get");
  const runtimePostResponses = object(runtimePost.responses, "runtime POST responses");
  equal(parameter(dashboard, "mode").required, false, "dashboard mode requiredness");
  equal(dereference(contract, object(parameter(dashboard, "mode").schema, "mode schema")).enum, ["demo", "live"], "dashboard mode enum");
  equal(parameter(state, "symbol").required, true, "market symbol requiredness");
  equal(parameter(state, "symbol").in, "path", "market symbol placement");
  equal(array(timeline.parameters, "timeline parameters").map((entry) => object(entry, "timeline parameter").name), ["symbol", "mode"], "timeline parameters");
  equal(array(anomalies.parameters, "anomaly parameters").map((entry) => object(entry, "anomaly parameter").name), ["symbol", "limit"], "anomaly parameters");
  if (!runtimeGet || !runtimePost) throw new Error("runtime method inventory incomplete");
  equal(Object.keys(runtimePostResponses).sort(), ["200", "400", "403", "409", "415", "422", "500"], "runtime POST error statuses");
  requireResponse(runtimePost, "400", "application/json", "ApiErrorResponse");
  requireResponse(runtimePost, "400", "text/plain; charset=utf-8", "ExtractorRejectionBody");
  requireResponse(runtimePost, "403", "application/json", "ApiErrorResponse");
  requireResponse(runtimePost, "409", "application/json", "ApiErrorResponse");
  requireResponse(runtimePost, "415", "text/plain; charset=utf-8", "ExtractorRejectionBody");
  requireResponse(runtimePost, "422", "text/plain; charset=utf-8", "ExtractorRejectionBody");
  requireResponse(runtimePost, "500", "application/json", "ApiErrorResponse");
  requireResponse(dashboard, "400", "text/plain; charset=utf-8", "ExtractorRejectionBody");
  requireResponse(timeline, "400", "text/plain; charset=utf-8", "ExtractorRejectionBody");
  requireResponse(timeline, "400", "application/json", "ApiErrorResponse");
  requireResponse(state, "400", "application/json", "ApiErrorResponse");
  if (schema(contract, "ExtractorRejectionBody").type !== "string") throw new Error("extractor body schema must be text");
  const request = schema(contract, "RuntimeModeSwitchRequest");
  equal(array(request.required, "request required").includes("symbols"), false, "optional symbols");
  requireSchemaProperty(contract, "RuntimeModeSwitchRequest", "symbols", { nullable: true });
  requireSchemaProperty(contract, "RuntimeModeSwitchRequest", "reset_state", { nullable: true });
  requireSchemaProperty(contract, "RuntimeModeSwitchRequest", "reset_storage", { nullable: true });
  requireSchemaProperty(contract, "DashboardSymbolSummary", "state", { nullable: true });
  requireSchemaProperty(contract, "DashboardSymbolSummary", "health", { nullable: true });
  if (!array(schema(contract, "DashboardStateSummary").required, "state required").includes("last_trade_price")) {
    throw new Error("required nullable response property missing");
  }
  const stateProperty = object(object(schema(contract, "MarketStateResponse").properties, "state properties").last_trade_price, "decimal property");
  equal(stateProperty.type, "string", "decimal representation");
  requireSchemaProperty(contract, "AnomalyResponse", "id", { format: "uuid" });
  requireSchemaProperty(contract, "AnomalyResponse", "event_time", { format: "date-time" });
  equal(schema(contract, "ContractSeverity").enum, ["info", "warning", "critical"], "severity enum");
  equal(object(schema(contract, "MarketTimelineResponse").properties, "timeline schema").points !== undefined, true, "timeline points");
  equal(object(schema(contract, "MarketTimelineResponse").properties, "timeline schema").anomalies !== undefined, true, "timeline anomalies");
  const metrics = object(contract["x-signalguard-metrics"], "metrics disposition");
  equal(metrics.contentType, "text/plain; version=0.0.4; charset=utf-8", "metrics content type");
}

function checkedArtifact(): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), "../contracts/web-console.openapi.json"), "utf8")) as unknown;
}

function clonedArtifact(): JsonObject {
  return object(JSON.parse(JSON.stringify(checkedArtifact())) as unknown, "cloned artifact");
}

describe("checked backend API contract", () => {
  it("accepts the real checked artifact", () => {
    expect(() => validateCompatibility(checkedArtifact())).not.toThrow();
  });

  it.each([
    ["parameter name", (fixture: JsonObject) => {
      const paths = object(fixture.paths, "paths");
      const operation = object(object(paths["/market/{symbol}/state"], "state path").get, "state operation");
      const parameters = array(operation.parameters, "parameters");
      object(parameters[0], "symbol parameter").name = "ticker";
    }],
    ["requiredness", (fixture: JsonObject) => {
      const paths = object(fixture.paths, "paths");
      const operation = object(object(paths["/market/{symbol}/state"], "state path").get, "state operation");
      object(array(operation.parameters, "parameters")[0], "symbol parameter").required = false;
    }],
    ["nullability", (fixture: JsonObject) => {
      const schemas = object(object(fixture.components, "components").schemas, "schemas");
      object(object(schemas.DashboardSymbolSummary, "summary").properties, "summary properties").state = { nullable: false };
    }],
    ["enum", (fixture: JsonObject) => {
      const schemas = object(object(fixture.components, "components").schemas, "schemas");
      object(schemas.ContractSeverity, "severity").enum = ["info", "warning"];
    }],
    ["required property", (fixture: JsonObject) => {
      const schemas = object(object(fixture.components, "components").schemas, "schemas");
      const state = object(schemas.DashboardStateSummary, "state");
      state.required = array(state.required, "required").filter((entry) => entry !== "last_trade_price");
    }],
    ["extractor media type", (fixture: JsonObject) => {
      const paths = object(fixture.paths, "paths");
      const post = object(object(paths["/runtime/mode"], "runtime path").post, "runtime post");
      delete responseContent(post, "415")["text/plain; charset=utf-8"];
    }],
    ["extractor schema", (fixture: JsonObject) => {
      const paths = object(fixture.paths, "paths");
      const post = object(object(paths["/runtime/mode"], "runtime path").post, "runtime post");
      object(responseContent(post, "415")["text/plain; charset=utf-8"], "extractor media").schema = { $ref: "#/components/schemas/ApiErrorResponse" };
    }],
    ["extractor status", (fixture: JsonObject) => {
      const paths = object(fixture.paths, "paths");
      delete object(object(paths["/runtime/mode"], "runtime path").post, "runtime post").responses;
      object(object(paths["/runtime/mode"], "runtime path").post, "runtime post").responses = { "200": {} };
    }],
    ["handler JSON response", (fixture: JsonObject) => {
      const paths = object(fixture.paths, "paths");
      const getState = object(object(paths["/market/{symbol}/state"], "state path").get, "state get");
      const content = responseContent(getState, "400");
      delete content["application/json"];
      content["text/plain; charset=utf-8"] = { schema: { $ref: "#/components/schemas/ExtractorRejectionBody" } };
    }],
  ])("rejects a mutated %s fixture through the reusable validator", (_name, mutate) => {
    const fixture = clonedArtifact();
    mutate(fixture);
    expect(() => validateCompatibility(fixture)).toThrow();
  });
});
