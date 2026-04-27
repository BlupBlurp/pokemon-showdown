#!/usr/bin/env node

"use strict";

const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CLIENT_PLAY_DIR = path.resolve(
	ROOT,
	"..",
	"pokemon-showdown-client",
	"play.pokemonshowdown.com",
);
const PORT = Number(process.env.RELUMI_CLIENT_PORT || 8001);
const SERVER_HOST = process.env.RELUMI_SERVER_HOST || "";
const SERVER_PORT = Number(process.env.RELUMI_SERVER_PORT || 8000);
const REMOTE_FALLBACK_HOST = "play.pokemonshowdown.com";

const MIME_TYPES = {
	".css": "text/css; charset=utf-8",
	".gif": "image/gif",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".js": "application/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".php": "application/javascript; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".txt": "text/plain; charset=utf-8",
	".webmanifest": "application/manifest+json; charset=utf-8",
	".webp": "image/webp",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

if (!fs.existsSync(CLIENT_PLAY_DIR)) {
	console.error("Relumi client folder not found:");
	console.error(`- ${CLIENT_PLAY_DIR}`);
	process.exit(1);
}

function send(res, status, body, headers = {}) {
	res.writeHead(status, {
		"Cache-Control": "no-store",
		...headers,
	});
	res.end(body);
}

function buildLocalConfigInjection() {
	const serverHostExpr = SERVER_HOST
		? JSON.stringify(SERVER_HOST)
		: '(window.location.hostname.startsWith("play.") ? window.location.hostname.replace(/^play\\./, "server.") : window.location.hostname)';
	const localClientRouteExpr = "window.location.host";
	return (
		"\n;(() => {\n" +
		"\tif (typeof Config === 'undefined') return;\n" +
		"\tconst relumiProtocol = (window.location.protocol === 'https:' ? 'https' : 'http');\n" +
		"\tconst relumiPort = (relumiProtocol === 'https' ? 443 : " +
		SERVER_PORT +
		");\n" +
		"\tconst relumiHost = " +
		serverHostExpr +
		";\n" +
		"\tConfig.defaultserver = Object.assign({}, Config.defaultserver || {}, {\n" +
		"\t\tid: 'showdown',\n" +
		"\t\thost: relumiHost,\n" +
		"\t\tport: relumiPort,\n" +
		"\t\thttpport: relumiPort,\n" +
		"\t\taltport: relumiPort,\n" +
		"\t\tprotocol: relumiProtocol,\n" +
		"\t\thttps: (relumiProtocol === 'https'),\n" +
		"\t\tprefix: '/showdown',\n" +
		"\t\tregistered: false,\n" +
		"\t});\n" +
		"\tconsole.log('[Relumi LocalConfig] Injecting server config:', Config.defaultserver);\n" +
		"\tConfig.server = Object.assign({}, Config.defaultserver);\n" +
		"\tConfig.routes = Object.assign({}, Config.routes || {}, {client: " +
		localClientRouteExpr +
		"});\n" +
		"\tconsole.log('[Relumi LocalConfig] Config.defaultserver set to:', Config.defaultserver);\n" +
		"})();\n"
	);
}

function rewriteHostedClientUrls(html) {
	return html
		.replace(/https?:\/\/play\.pokemonshowdown\.com\//g, "/")
		.replace(/\/\/play\.pokemonshowdown\.com\//g, "/");
}

function injectLocalDexOverride(html) {
	if (html.includes("relumi-local-battle-dex")) return html;
	const marker =
		/(<script[^>]+src=["']\/js\/battledata\.js[^"']*["'][^>]*><\/script>)/i;
	if (!marker.test(html)) return html;
	return html.replace(
		marker,
		'$1\n<script src="/js/battle-dex.js?relumi-local-battle-dex=1"></script>',
	);
}

function rewriteLanLocalDevChecks(source) {
	const localDevExpr =
		'(location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "::1" || location.hostname.endsWith(".local") || /^10\\./.test(location.hostname) || /^192\\.168\\./.test(location.hostname) || /^172\\.(1[6-9]|2\\d|3[0-1])\\./.test(location.hostname) || /^169\\.254\\./.test(location.hostname) || /^100\\.(6[4-9]|[78]\\d|9\\d|1[01]\\d|12[0-7])\\./.test(location.hostname))';

	let text = source.replace(
		/location\.hostname === "localhost" \|\| location\.hostname === "127\.0\.0\.1"/g,
		localDevExpr,
	);

	text = text.replace(
		/location\.hostname==="localhost"\|\|location\.hostname==="127\.0\.0\.1"/g,
		localDevExpr,
	);

	return text;
}

function shouldServeIndexFallback(req, normalized) {
	if (req.method !== "GET" && req.method !== "HEAD") return false;
	if (normalized === "/" || normalized === "/index.html") return true;
	if (normalized.startsWith("/~~")) return false;
	return !path.extname(normalized);
}

function sendIndexHtml(res, indexPath) {
	const text = injectLocalDexOverride(
		rewriteHostedClientUrls(fs.readFileSync(indexPath, "utf8")),
	);
	return send(res, 200, text, {
		"Content-Type": "text/html; charset=utf-8",
	});
}

function proxyRemoteAsset(req, reqUrl, res) {
	let upstreamPath = reqUrl;
	if (/^\/~~relumi\/action\.php(?:\?|$)/.test(upstreamPath)) {
		upstreamPath = upstreamPath.replace("/~~relumi/", "/~~showdown/");
	}

	const headers = { ...req.headers };
	delete headers.host;
	delete headers["content-length"];

	const upstream = https.request(
		{
			host: REMOTE_FALLBACK_HOST,
			method: req.method || "GET",
			path: upstreamPath,
			headers,
		},
		(upstreamRes) => {
			const status = upstreamRes.statusCode || 502;
			if (status >= 400) {
				upstreamRes.resume();
				return send(res, status, `Upstream responded with ${status}\n`, {
					"Content-Type": "text/plain; charset=utf-8",
				});
			}

			const ext = path.extname(reqUrl.split("?")[0]).toLowerCase();
			let type =
				upstreamRes.headers["content-type"] ||
				MIME_TYPES[ext] ||
				"application/octet-stream";

			// clean-cookies.php is loaded as a script by the upstream client.
			// If upstream omits a content type, serve it as JS to avoid browser blocking.
			if (ext === ".php" && reqUrl.startsWith("/js/")) {
				type = "application/javascript; charset=utf-8";
			}

			const responseHeaders = {
				...upstreamRes.headers,
				"access-control-allow-origin": "*",
				"cache-control": "no-store",
				"content-type": type,
			};

			// Upstream auth cookies are scoped for pokemonshowdown.com and can include
			// Secure/SameSite=None, which browsers reject on local HTTP LAN hosts.
			// Rewrite them to host-only local cookies so login state persists in dev.
			const setCookie = responseHeaders["set-cookie"];
			if (setCookie) {
				const rewriteCookie = (cookie) =>
					cookie
						.replace(/;\s*Domain=[^;]*/gi, "")
						.replace(/;\s*Secure/gi, "")
						.replace(/;\s*SameSite=None/gi, "; SameSite=Lax");
				responseHeaders["set-cookie"] = Array.isArray(setCookie)
					? setCookie.map(rewriteCookie)
					: rewriteCookie(setCookie);
			}

			res.writeHead(status, responseHeaders);
			upstreamRes.pipe(res);
		},
	);

	upstream.on("error", (err) => {
		console.error("[relumi-client] upstream proxy error:", err.message);
		send(res, 502, "Bad Gateway\n", {
			"Content-Type": "text/plain; charset=utf-8",
		});
	});

	if (
		req.method === "POST" ||
		req.method === "PUT" ||
		req.method === "PATCH"
	) {
		req.pipe(upstream);
	} else {
		upstream.end();
	}
}

const server = http.createServer((req, res) => {
	const reqUrl = req.url || "/";
	const rawPath = reqUrl.split("?")[0];
	if (rawPath === "/index.html") {
		res.writeHead(302, {
			Location: "/",
			"Cache-Control": "no-store",
		});
		res.end();
		return;
	}
	const normalized = decodeURIComponent(
		rawPath === "/" ? "/index.html" : rawPath,
	);
	const resolved = path.resolve(CLIENT_PLAY_DIR, `.${normalized}`);

	if (!resolved.startsWith(CLIENT_PLAY_DIR)) {
		return send(res, 403, "Forbidden\n", {
			"Content-Type": "text/plain; charset=utf-8",
		});
	}

	let filePath = resolved;
	if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
		filePath = path.join(filePath, "index.html");
	}

	if (!fs.existsSync(filePath)) {
		if (shouldServeIndexFallback(req, normalized)) {
			const indexPath = path.join(CLIENT_PLAY_DIR, "index.html");
			if (fs.existsSync(indexPath)) {
				return sendIndexHtml(res, indexPath);
			}
		}

		// Missing static assets proxy to upstream (sprites, fx, etc.).
		return proxyRemoteAsset(req, reqUrl, res);
	}

	if (normalized === "/config/config.js") {
		const text =
			fs.readFileSync(filePath, "utf8") + buildLocalConfigInjection();
		return send(res, 200, text, {
			"Content-Type": "application/javascript; charset=utf-8",
		});
	}

	if (normalized === "/js/storage.js") {
		const text = rewriteLanLocalDevChecks(fs.readFileSync(filePath, "utf8"));
		return send(res, 200, text, {
			"Content-Type": "application/javascript; charset=utf-8",
		});
	}

	if (normalized === "/js/client-connection.js") {
		const text = rewriteLanLocalDevChecks(fs.readFileSync(filePath, "utf8"));
		return send(res, 200, text, {
			"Content-Type": "application/javascript; charset=utf-8",
		});
	}

	if (normalized === "/js/clean-cookies.php") {
		return send(
			res,
			200,
			"// Local relumi dev: noop clean-cookies script to avoid parser errors.\n",
			{
				"Content-Type": "application/javascript; charset=utf-8",
			},
		);
	}

	if (normalized === "/index.html") {
		return sendIndexHtml(res, filePath);
	}

	const ext = path.extname(filePath).toLowerCase();
	const type = MIME_TYPES[ext] || "application/octet-stream";

	fs.createReadStream(filePath)
		.on("error", () =>
			send(res, 500, "Internal Server Error\n", {
				"Content-Type": "text/plain; charset=utf-8",
			}),
		)
		.pipe(
			res.writeHead(200, {
				"Content-Type": type,
				"Cache-Control": "no-store",
			}),
		);
});

server.on("error", (err) => {
	console.error("Relumi client server error:", err.message);
	process.exit(1);
});

server.listen(PORT, "0.0.0.0", () => {
	console.log(
		`Relumi client host ready at http://localhost:${PORT}/index.html`,
	);
	console.log(`Serving files from: ${CLIENT_PLAY_DIR}`);
});
