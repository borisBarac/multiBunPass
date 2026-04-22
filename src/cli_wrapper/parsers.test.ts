import { describe, expect, test } from "bun:test";
import { parseVMInfo } from "./parsers";

function makeInfoJson(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		info: {
			testvm: {
				state: "Running",
				snapshots: { count: 3 },
				ipv4: ["10.0.0.1"],
				release: { extended_status: "Ubuntu 24.04.4 LTS" },
				image_hash: "abc123",
				cpu_count: { total: 4 },
				load: [0.1, 0.2, 0.3],
				disk: { used: "2GiB", total: "10GiB" },
				memory: { used: "512MiB", total: "2GiB" },
				mounts: { "/host/path": {} },
				...overrides,
			},
		},
	});
}

describe("parseVMInfo", () => {
	test("parses full JSON into VMDetailedInfo", () => {
		const result = parseVMInfo("testvm", makeInfoJson());
		expect(result.name).toBe("testvm");
		expect(result.state).toBe("Running");
		expect(result.snapshots).toBe(3);
		expect(result.ipv4).toEqual(["10.0.0.1"]);
		expect(result.release).toBe("Ubuntu 24.04.4 LTS");
		expect(result.image_hash).toBe("abc123");
		expect(result.cpu_count).toBe(4);
		expect(result.load).toEqual([0.1, 0.2, 0.3]);
		expect(result.disk).toEqual({ used: "2GiB", total: "10GiB" });
		expect(result.memory).toEqual({ used: "512MiB", total: "2GiB" });
		expect(result.mounts).toEqual(["/host/path"]);
	});

	test("extracts mounts keys from object", () => {
		const json = makeInfoJson({
			mounts: { "/a": {}, "/b": {}, "/c": {} },
		});
		const result = parseVMInfo("testvm", json);
		expect(result.mounts).toEqual(["/a", "/b", "/c"]);
	});

	test("defaults state to Unknown when missing", () => {
		const json = makeInfoJson({ state: undefined });
		const cleaned = json.replace('"state":undefined,', "");
		const result = parseVMInfo("testvm", cleaned);
		expect(result.state).toBe("Unknown");
	});

	test("defaults snapshots to 0 when missing", () => {
		const json = makeInfoJson({ snapshots: undefined });
		const cleaned = json.replace('"snapshots":undefined,', "");
		const result = parseVMInfo("testvm", cleaned);
		expect(result.snapshots).toBe(0);
	});

	test("defaults ipv4 to empty array when missing", () => {
		const json = makeInfoJson({ ipv4: undefined });
		const cleaned = json.replace('"ipv4":undefined,', "");
		const result = parseVMInfo("testvm", cleaned);
		expect(result.ipv4).toEqual([]);
	});

	test("falls back to raw release string when extended_status missing", () => {
		const json = makeInfoJson({ release: "24.04" });
		const result = parseVMInfo("testvm", json);
		expect(result.release).toBe("24.04");
	});

	test("defaults empty string for missing image_hash", () => {
		const json = makeInfoJson({ image_hash: undefined });
		const cleaned = json.replace('"image_hash":undefined,', "");
		const result = parseVMInfo("testvm", cleaned);
		expect(result.image_hash).toBe("");
	});

	test("defaults cpu_count to 0 when missing", () => {
		const json = makeInfoJson({ cpu_count: undefined });
		const cleaned = json.replace('"cpu_count":undefined,', "");
		const result = parseVMInfo("testvm", cleaned);
		expect(result.cpu_count).toBe(0);
	});

	test("defaults disk and memory to empty strings when missing", () => {
		const json = makeInfoJson({ disk: undefined, memory: undefined });
		let cleaned = json.replace('"disk":undefined,', "");
		cleaned = cleaned.replace('"memory":undefined,', "");
		const result = parseVMInfo("testvm", cleaned);
		expect(result.disk).toEqual({ used: "", total: "" });
		expect(result.memory).toEqual({ used: "", total: "" });
	});

	test("defaults mounts to empty array when null", () => {
		const json = makeInfoJson({ mounts: null });
		const result = parseVMInfo("testvm", json);
		expect(result.mounts).toEqual([]);
	});

	test("throws when info name not found in JSON", () => {
		const json = JSON.stringify({ info: { other_vm: { state: "Running" } } });
		expect(() => parseVMInfo("nonexistent", json)).toThrow(
			'No info returned for VM "nonexistent"',
		);
	});
});
