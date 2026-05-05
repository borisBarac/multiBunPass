import type { VMDetailedInfo, VMInfo } from "../cli_wrapper/types";

export function formatTable(headers: string[], rows: string[][]): string {
	const colWidths = headers.map((h, ci) =>
		Math.max(h.length, ...rows.map((r) => (r[ci] ?? "").length)),
	);
	const lines: string[] = [];
	lines.push(
		headers.map((h, i) => h.padEnd(colWidths[i] as number)).join("  "),
	);
	lines.push(colWidths.map((w) => "-".repeat(w as number)).join("  "));
	for (const row of rows) {
		lines.push(
			headers
				.map((_, ci) => (row[ci] ?? "").padEnd(colWidths[ci] as number))
				.join("  "),
		);
	}
	return lines.join("\n");
}

export function formatList(vms: VMInfo[]): string {
	if (vms.length === 0) return "No VMs found.";
	return formatTable(
		["Name", "State", "IPv4", "Image", "Release"],
		vms.map((v) => [
			v.name,
			v.state,
			v.ipv4.join(", ") || "-",
			v.image || "-",
			v.release || "-",
		]),
	);
}

export function formatInfo(info: VMDetailedInfo): string {
	const lines = [
		`Name:       ${info.name}`,
		`State:      ${info.state}`,
		`Snapshots:  ${info.snapshots}`,
		`IPv4:       ${info.ipv4.join(", ") || "-"}`,
		`Release:    ${info.release || "-"}`,
		`Image Hash: ${info.image_hash || "-"}`,
		`CPU Count:  ${info.cpu_count}`,
		`Load:       ${info.load.join(", ") || "-"}`,
		`Disk:       ${info.disk.used || "-"} / ${info.disk.total || "-"}`,
		`Memory:     ${info.memory.used || "-"} / ${info.memory.total || "-"}`,
		`Mounts:     ${info.mounts.join(", ") || "-"}`,
	];
	return lines.join("\n");
}
