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
	"play.pokemonshowdown.com"
);
const PORT = Number(process.env.RELUMI_CLIENT_PORT || 8001);
const SERVER_HOST = process.env.RELUMI_SERVER_HOST || "";
const SERVER_PORT = Number(process.env.RELUMI_SERVER_PORT || 8000);
const REMOTE_FALLBACK_HOST = "play.pokemonshowdown.com";
const NEWS_INC_PATH = path.resolve(
	ROOT,
	"..",
	"pokemon-showdown-client",
	"config",
	"news.inc.php"
);

const AVATARS_DIR = path.resolve(ROOT, "config", "avatars");

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

function buildServerAvatarsList() {
	try {
		const files = fs.readdirSync(AVATARS_DIR).filter(f => /\.png$/i.test(f));
		return JSON.stringify(files);
	} catch { return "[]"; }
}

function buildLocalConfigInjection() {
	const serverHostExpr = SERVER_HOST ? JSON.stringify(SERVER_HOST) : '(window.location.hostname.startsWith("play.") ? window.location.hostname.replace(/^play\\./, "server.") : window.location.hostname)';
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
		"\t\t// httpport being truthy is PSServer's signal to set protocol='https'; omit it on HTTP.\n" +
		"\t\thttpport: (relumiProtocol === 'https' ? relumiPort : undefined),\n" +
		"\t\taltport: relumiPort,\n" +
		"\t\tprotocol: relumiProtocol,\n" +
		"\t\thttps: (relumiProtocol === 'https'),\n" +
		"\t\tprefix: '/showdown',\n" +
		"\t\tregistered: true,\n" +
		"\t});\n" +
		"\tconsole.log('[Relumi LocalConfig] Injecting server config:', Config.defaultserver);\n" +
		"\tConfig.server = Object.assign({}, Config.defaultserver);\n" +
		"\tConfig.routes = Object.assign({}, Config.routes || {}, {client: " +
		localClientRouteExpr +
		"});\n" +
		"\tConfig.serverAvatars = " + buildServerAvatarsList() + ";\n" +
		"\tconsole.log('[Relumi LocalConfig] Config.defaultserver set to:', Config.defaultserver);\n" +
		"})();\n"
	);
}

/**
 * Parse config/news.inc.php and render news HTML.
 * Mirrors the PHP renderNews()/getNewsId() logic from
 * pokemonshowdown.com/news/include.php without running PHP.
 */
function loadNewsFromPhp() {
	try {
		const php = fs.readFileSync(NEWS_INC_PATH, "utf8");

		// Extract ordered topic IDs from $latestNewsCache.
		const idsMatch = php.match(
			/\$latestNewsCache\s*=\s*\[([^\]]+)\]/
		);
		if (!idsMatch) return { newsid: "", news: "" };
		const topicIds = idsMatch[1]
			.match(/'([^']+)'/g)
			.map(s => s.replace(/'/g, ""));

		// Extract each news entry keyed by its topic_id.
		const entries = {};
		const entryRe =
			/'(\d+)'\s*=>\s*\[([\s\S]*?)\]\s*(?:,\s*(?='|\])|\])/g;
		let m;
		while ((m = entryRe.exec(php)) !== null) {
			const id = m[1];
			const block = m[2];
			const field = key => {
				// Match single-quoted string values.
				const strRe = new RegExp(
					"'" + key + "'\\s*=>\\s*'((?:[^'\\\\]|\\\\.)*)'"
				);
				const strMatch = block.match(strRe);
				if (strMatch) return strMatch[1].replace(/\\'/g, "'");
				// Match bare numeric values (e.g. 'date' => 1774939138).
				const numRe = new RegExp(
					"'" + key + "'\\s*=>\\s*(\\d+)"
				);
				const numMatch = block.match(numRe);
				return numMatch ? numMatch[1] : "";
			};
			entries[id] = {
				title_html: field("title_html"),
				summary_html: field("summary_html"),
				authorname: field("authorname"),
				date: Number(field("date")) || 0,
			};
		}

		const newsid = topicIds[0] || "";
		let html = "";
		let count = 0;
		for (const tid of topicIds) {
			const e = entries[tid];
			if (!e) continue;
			const dateStr = e.date
				? new Date(e.date * 1000).toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
					year: "numeric",
				})
				: "";
			html +=
				`<div class="newsentry" data-newsid="${tid}" data-date="${e.date}">` +
				`<h4>${e.title_html}</h4>` +
				e.summary_html +
				`<p>&mdash;<strong>${e.authorname}</strong> ` +
				`<small class="date">on ${dateStr}</small></p>` +
				`</div>`;
			if (++count >= 2) break;
		}
		return { newsid, news: html };
	} catch {
		return { newsid: "", news: "" };
	}
}

// Cache news at startup; re-read on each request would be wasteful.
const cachedNews = loadNewsFromPhp();

function injectNews(html) {
	html = html.replace(/<!-- newsid -->/g, cachedNews.newsid);
	html = html.replace(/<!-- news -->/g, cachedNews.news);
	html = html.replace(/<!--\s*build-tools\/news-embed\.php\s*-->/g, cachedNews.news);
	return html;
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
		'$1\n<script src="/js/battle-dex.js?relumi-local-battle-dex=1"></script>'
	);
}

// Force pushState off when the URL ends in .html so the legacy Backbone
// router doesn't rewrite /index-old.html to / via history.pushState. The
// upstream caches/index-old.html references the upstream's client.js
// directly, so a source-only fix in src/oldclient/client.js isn't enough
// on every path. This guard runs at HTML serve time and works no matter
// which client.js the browser ends up loading.
function injectBackbonePushStateGuard(html) {
	if (html.includes("relumi-backbone-pushstate-guard")) return html;
	const guard =
		'<script>/* relumi-backbone-pushstate-guard */' +
		'(function(){' +
		'if(!window.Backbone||location.pathname.slice(-5)!==".html")return;' +
		'var s=Backbone.history.start;' +
		'Backbone.history.start=function(o){return s.call(this,Object.assign({},o,{pushState:false}));};' +
		'})();</script>';
	const marker =
		/(<script[^>]+src=["']\/js\/lib\/backbone\.js[^"']*["'][^>]*><\/script>)/i;
	if (!marker.test(html)) return html;
	return html.replace(marker, `$1\n${guard}`);
}

function rewriteLanLocalDevChecks(source) {
	const localDevExpr =
		'(location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "::1" || location.hostname.endsWith(".local") || /^10\\./.test(location.hostname) || /^192\\.168\\./.test(location.hostname) || /^172\\.(1[6-9]|2\\d|3[0-1])\\./.test(location.hostname) || /^169\\.254\\./.test(location.hostname) || /^100\\.(6[4-9]|[78]\\d|9\\d|1[01]\\d|12[0-7])\\./.test(location.hostname))';

	let text = source.replace(
		/location\.hostname === "localhost" \|\| location\.hostname === "127\.0\.0\.1"/g,
		localDevExpr
	);

	text = text.replace(
		/location\.hostname==="localhost"\|\|location\.hostname==="127\.0\.0\.1"/g,
		localDevExpr
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
	const text = injectNews(
		injectBackbonePushStateGuard(
			injectLocalDexOverride(
				rewriteHostedClientUrls(fs.readFileSync(indexPath, "utf8"))
			)
		)
	);
	return send(res, 200, text, {
		"Content-Type": "text/html; charset=utf-8",
	});
}

function proxyToGameServer(req, reqUrl, res) {
	// Forward act=getteams / act=getteam to the local game server (port 8000)
	// which handles them via customhttpresponse in config.js.
	const headers = { ...req.headers };
	delete headers.host;
	delete headers["content-length"];

	const upstream = http.request(
		{
			host: "127.0.0.1",
			port: SERVER_PORT,
			method: req.method || "GET",
			path: reqUrl,
			headers,
		},
		upstreamRes => {
			const status = upstreamRes.statusCode || 502;
			res.writeHead(status, {
				"Content-Type": upstreamRes.headers["content-type"] || "text/plain; charset=utf-8",
				"Cache-Control": "no-store",
				"Access-Control-Allow-Origin": "*",
			});
			upstreamRes.pipe(res);
		}
	);

	upstream.on("error", err => {
		console.error("[relumi-client] game server proxy error:", err.message);
		send(res, 502, "]" + JSON.stringify({ actionerror: "Game server unavailable." }), {
			"Content-Type": "text/plain; charset=utf-8",
		});
	});

	if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
		req.pipe(upstream);
	} else {
		upstream.end();
	}
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
		upstreamRes => {
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
				const rewriteCookie = cookie =>
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
		}
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
		rawPath === "/" ? "/index.html" : rawPath
	);

	// The upstream build now creates an empty index.html placeholder that would
	// be served as a blank page.  Always rewrite /index.html → /index-new.html
	// so the preact-alpha client is the default.
	const remapped = normalized === "/index.html" ? "/index-new.html" : normalized;
	const resolved = path.resolve(CLIENT_PLAY_DIR, `.${remapped}`);

	if (!resolved.startsWith(CLIENT_PLAY_DIR)) {
		return send(res, 403, "Forbidden\n", {
			"Content-Type": "text/plain; charset=utf-8",
		});
	}

	let filePath = resolved;
	if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
		// New preact-alpha client is the default; the legacy Backbone index is
		// still reachable at its explicit `/index-old.html` URL.
		filePath = path.join(filePath, "index-new.html");
	}

	// Proxy /api/battlestats to the local game server (port 8000). Match the
	// exact endpoint AND any sub-endpoint (e.g. /species-trends, /random-team)
	// so all stats routes resolve through the game server. Query strings
	// are stripped from `normalized` upstream, so just the path matters.
	if (
		normalized === "/api/battlestats" ||
		normalized.startsWith("/api/battlestats/")
	) {
		return proxyToGameServer(req, reqUrl, res);
	}

	if (!fs.existsSync(filePath)) {
		if (shouldServeIndexFallback(req, normalized)) {
			const indexPath = path.join(CLIENT_PLAY_DIR, "index-new.html");
			if (fs.existsSync(indexPath)) {
				return sendIndexHtml(res, indexPath);
			}
		}

		// Route getteams/getteam to the local game server so the teambuilder
		// loads teams from our own Neon database instead of the official PS one.
		if (normalized.startsWith("/~~") && normalized.includes("action.php")) {
			const qs = reqUrl.includes("?") ? reqUrl.slice(reqUrl.indexOf("?") + 1) : "";
			const params = new URLSearchParams(qs);
			const act = params.get("act");
			if (act === "getteams" || act === "getteam") {
				return proxyToGameServer(req, reqUrl, res);
			}
		}

		// Route replay .json requests to the local game server
		// which serves them from the replays Postgres table.
		if (/^\/(.+)\.json$/.test(normalized)) {
			return proxyToGameServer(req, reqUrl, res);
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
			}
		);
	}

	if (normalized.endsWith(".html")) {
		return sendIndexHtml(res, filePath);
	}

	const ext = path.extname(filePath).toLowerCase();
	const type = MIME_TYPES[ext] || "application/octet-stream";

	fs.createReadStream(filePath)
		.on("error", () =>
			send(res, 500, "Internal Server Error\n", {
				"Content-Type": "text/plain; charset=utf-8",
			})
		)
		.pipe(
			res.writeHead(200, {
				"Content-Type": type,
				"Cache-Control": "no-store",
			})
		);
});

server.on("error", (err) => {
	console.error("Relumi client server error:", err.message);
	process.exit(1);
});

server.listen(PORT, "0.0.0.0", () => {
	console.log(
		`Relumi client host ready at http://localhost:${PORT}/ (preact-alpha) and http://localhost:${PORT}/index-old.html (legacy Backbone)`,
	);
	console.log(`Serving files from: ${CLIENT_PLAY_DIR}`);
});
