import type { VMDetailedInfo } from "./types";

export function parseVMInfo(name: string, json: string): VMDetailedInfo {
	const parsed = JSON.parse(json);
	const raw = parsed.info?.[name];
	if (!raw) {
		throw new Error(`No info returned for VM "${name}"`);
	}

	const diskEntry = raw.disks ? Object.values(raw.disks)[0] : undefined;

	return {
		name,
		state: raw.state || "Unknown",
		snapshots: Number(raw.snapshot_count ?? raw.snapshots?.count ?? 0),
		ipv4: raw.ipv4 ?? [],
		release: raw.release?.extended_status || raw.release || "",
		image_hash: raw.image_hash || "",
		cpu_count: Number(raw.cpu_count?.total ?? raw.cpu_count ?? 0),
		load: raw.load ?? [],
		disk: {
			used: String(diskEntry?.used ?? raw.disk?.used ?? ""),
			total: String(diskEntry?.total ?? raw.disk?.total ?? ""),
		},
		memory: {
			used: String(raw.memory?.used ?? ""),
			total: String(raw.memory?.total ?? ""),
		},
		mounts: raw.mounts ? Object.keys(raw.mounts) : [],
	};
}
