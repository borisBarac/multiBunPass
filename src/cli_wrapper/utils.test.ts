import { describe, expect, test } from "bun:test";
import { expandTilde, shellEscape } from "./utils";

describe("shellEscape", () => {
	test("returns plain paths unchanged", () => {
		expect(shellEscape("/home/ubuntu/app")).toBe("/home/ubuntu/app");
	});

	test("escapes single quotes", () => {
		expect(shellEscape("it's")).toBe("it'\\''s");
	});

	test("escapes multiple single quotes", () => {
		expect(shellEscape("a'b'c")).toBe("a'\\''b'\\''c");
	});

	test("handles empty string", () => {
		expect(shellEscape("")).toBe("");
	});

	test("handles string that is just a single quote", () => {
		expect(shellEscape("'")).toBe("'\\''");
	});

	test("handles paths with spaces (no escaping needed)", () => {
		expect(shellEscape("/path/with spaces/app")).toBe("/path/with spaces/app");
	});
});

describe("expandTilde", () => {
	test("expands ~/ to /home/ubuntu/", () => {
		expect(expandTilde("~/app/")).toBe("/home/ubuntu/app/");
	});

	test("leaves absolute paths unchanged", () => {
		expect(expandTilde("/var/data")).toBe("/var/data");
	});

	test("leaves relative paths without tilde unchanged", () => {
		expect(expandTilde("some/path")).toBe("some/path");
	});
});
