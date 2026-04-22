import type { VMDetailedInfo } from "./types";

export function parseVMInfo(name: string, json: string): VMDetailedInfo {
	const parsed = JSON.parse(json);
	const raw = parsed.info?.[name];
	if (!raw) {
		throw new Error(`No info returned for VM "${name}"`);
	}
	return {
		name,
		state: raw.state || "Unknown",
		snapshots: raw.snapshots?.count ?? 0,
		ipv4: raw.ipv4 ?? [],
		release: raw.release?.extended_status || raw.release || "",
		image_hash: raw.image_hash || "",
		cpu_count: raw.cpu_count?.total ?? 0,
		load: raw.load ?? [],
		disk: {
			used: raw.disk?.used ?? "",
			total: raw.disk?.total ?? "",
		},
		memory: {
			used: raw.memory?.used ?? "",
			total: raw.memory?.total ?? "",
		},
		mounts: raw.mounts ? Object.keys(raw.mounts) : [],
	};
}
