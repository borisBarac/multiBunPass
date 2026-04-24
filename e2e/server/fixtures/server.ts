const server = Bun.serve({
	port: 3000,
	fetch(req) {
		return new Response("Hello from MultiBunPass!");
	},
});
console.log(`Server listening on http://localhost:${server.port}`);
