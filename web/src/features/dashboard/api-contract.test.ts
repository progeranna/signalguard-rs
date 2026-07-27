import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const contract = JSON.parse(readFileSync(resolve(process.cwd(), "../contracts/web-console.openapi.json"), "utf8"));
const paths = contract.paths as Record<string, Record<string, any>>;
const schema = (name: string) => contract.components.schemas[name];
const prop = (name: string, field: string) => schema(name).properties[field];

describe("checked backend API contract", () => {
  it("matches api.ts endpoint and parameter boundary", () => {
    expect(Object.keys(paths).sort()).toEqual(["/anomalies", "/dashboard/summary", "/health", "/market/{symbol}/health", "/market/{symbol}/state", "/market/{symbol}/timeline", "/pipeline/health", "/runtime/mode", "/symbols"]);
    expect(paths["/runtime/mode"]).toHaveProperty("get");
    expect(paths["/runtime/mode"]).toHaveProperty("post");
    expect(paths["/dashboard/summary"].get.parameters[0]).toMatchObject({ name: "mode", in: "query", required: false, schema: { enum: ["demo", "live"] } });
    expect(paths["/market/{symbol}/state"].get.parameters[0]).toMatchObject({ name: "symbol", in: "path", required: true });
    expect(paths["/market/{symbol}/timeline"].get.parameters.map((p: any) => p.name)).toEqual(["symbol", "mode"]);
    expect(paths["/anomalies"].get.parameters.map((p: any) => p.name)).toEqual(["symbol", "limit"]);
  });
  it("describes nullable values, formats, enums, arrays, and nested fields", () => {
    expect(prop("DashboardSymbolSummary", "state")).toMatchObject({ nullable: true });
    expect(prop("DashboardSymbolSummary", "health")).toMatchObject({ nullable: true });
    expect(prop("MarketStateResponse", "last_trade_price")).toMatchObject({ type: "string", nullable: true });
    expect(prop("MarketStateResponse", "last_event_time")).toMatchObject({ format: "date-time", nullable: true });
    expect(prop("AnomalyResponse", "id")).toMatchObject({ format: "uuid" });
    expect(prop("AnomalyResponse", "severity").enum).toEqual(["info", "warning", "critical"]);
    expect(prop("MarketTimelineResponse", "points")).toMatchObject({ type: "array" });
    expect(prop("MarketTimelinePointResponse", "timestamp")).toMatchObject({ format: "date-time" });
    expect(prop("RuntimeModeSwitchRequest", "mode").enum).toEqual(["replay", "live"]);
    expect(schema("RuntimeModeResponse").required).toContain("mode");
    expect(contract["x-signalguard-metrics"]).toMatchObject({ contentType: "text/plain; version=0.0.4; charset=utf-8" });
  });
  it("keeps additive backend properties compatible and catches mutated fixtures", () => {
    const fixture = JSON.parse(JSON.stringify(contract));
    fixture.components.schemas.MarketStateResponse.properties.backend_extra = { type: "string" };
    expect(fixture.components.schemas.MarketStateResponse.additionalProperties).toBe(true);
    fixture.paths["/market/{symbol}/state"].get.parameters[0].name = "ticker";
    expect(fixture.paths["/market/{symbol}/state"].get.parameters[0].name).not.toBe("symbol");
    fixture.components.schemas.DashboardSymbolSummary.properties.state.nullable = false;
    expect(fixture.components.schemas.DashboardSymbolSummary.properties.state.nullable).toBe(false);
  });
});
