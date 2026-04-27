import { networkInterfaces } from "node:os";

function getLocalIp(): string {
	const nics = networkInterfaces();
	for (const addrs of Object.values(nics)) {
		for (const addr of addrs ?? []) {
			if (addr.family === "IPv4" && !addr.internal) {
				return addr.address;
			}
		}
	}
	return "127.0.0.1";
}

const server = Bun.serve({
	hostname: "0.0.0.0",
	port: 3000,
	fetch(_req) {
		return new Response("Hello from MultiBunPass!");
	},
});
console.log(`Server listening on http://${getLocalIp()}:${server.port}`);
