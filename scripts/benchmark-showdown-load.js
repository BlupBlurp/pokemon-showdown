#!/usr/bin/env node
'use strict';

/**
 * Lightweight Pokemon Showdown load benchmark for connection and battle concurrency.
 *
 * Usage examples:
 *   node scripts/benchmark-showdown-load.js --url wss://relumishowdown.dpdns.org/showdown/websocket
 *   node scripts/benchmark-showdown-load.js --format gen8relumirandomsingles --battle-ramp 2,5,10,20
 *
 * Notes:
 * - Requires the `ws` package: npm i --no-save ws
 * - Ramp conservatively if running behind Cloudflare Tunnel to avoid edge rate limits.
 */

const {performance} = require('perf_hooks');
const {execSync} = require('child_process');

let WebSocket;
try {
	WebSocket = require('ws');
} catch (err) {
	console.error('Missing dependency: ws');
	console.error('Install with: npm i --no-save ws');
	process.exit(1);
}

function parseArgs(argv) {
	const args = Object.create(null);
	for (let i = 2; i < argv.length; i++) {
		const token = argv[i];
		if (!token.startsWith('--')) continue;
		const key = token.slice(2);
		const next = argv[i + 1];
		if (!next || next.startsWith('--')) {
			args[key] = 'true';
		} else {
			args[key] = next;
			i++;
		}
	}
	return args;
}

function parseRamp(value, fallback) {
	if (!value) return fallback;
	const parsed = value.split(',').map(x => Number(x.trim())).filter(x => Number.isFinite(x) && x > 0);
	return parsed.length ? parsed : fallback;
}

function percentile(values, p) {
	if (!values.length) return 0;
	const sorted = values.slice().sort((a, b) => a - b);
	const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
	return sorted[idx];
}

function avg(values) {
	if (!values.length) return 0;
	return values.reduce((a, b) => a + b, 0) / values.length;
}

function fmtMs(n) {
	return `${n.toFixed(1)}ms`;
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeErrorReason(err) {
	if (!err) return 'unknown';
	if (err.code && err.message) return `${err.code}: ${err.message}`;
	if (err.code) return String(err.code);
	if (err.message) return String(err.message);
	return String(err);
}

function countReason(map, reason) {
	map.set(reason, (map.get(reason) || 0) + 1);
}

function formatReasonSummary(map, max = 3) {
	if (!map.size) return '';
	const pairs = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, max);
	return pairs.map(([reason, count]) => `${count}x ${reason}`).join(' | ');
}

class PSClient {
	constructor(url, id, options) {
		this.url = url;
		this.id = id;
		this.options = options;
		this.ws = null;
		this.connected = false;
		this.closed = false;
		this.lastError = null;
		this.handlers = [];
		this.rooms = new Set();
	}

	connect(timeoutMs) {
		return new Promise((resolve, reject) => {
			const started = performance.now();
			let settled = false;
			const wsOptions = {
				headers: {
					'User-Agent': 'relumi-load-bench/1.0',
				},
			};
			if (this.options.allowInsecureTls) wsOptions.rejectUnauthorized = false;
			const ws = new WebSocket(this.url, wsOptions);
			this.ws = ws;

			const finishReject = (err) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				this.lastError = err;
				reject(err);
			};

			const timer = setTimeout(() => {
				const timeoutErr = new Error('connect timeout');
				try { ws.close(); } catch {}
				finishReject(timeoutErr);
			}, timeoutMs);

			ws.on('open', () => {
				if (settled) return;
				settled = true;
				this.connected = true;
				clearTimeout(timer);
				resolve(performance.now() - started);
			});

			ws.on('message', data => {
				const text = data.toString();
				this._handlePacket(text);
			});

			ws.on('error', err => finishReject(err));

			ws.on('unexpected-response', (_req, res) => {
				finishReject(new Error(`unexpected HTTP ${res.statusCode || 'response'}`));
			});

			ws.on('close', () => {
				this.closed = true;
				this.connected = false;
				if (!settled) finishReject(new Error('closed before open'));
			});
		});
	}

	send(message) {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
		this.ws.send(message);
	}

	onMessage(handler) {
		this.handlers.push(handler);
	}

	close() {
		if (!this.ws) return;
		try {
			this.ws.close();
		} catch {}
	}

	_handlePacket(packet) {
		let roomid = '';
		let payload = packet;
		if (packet.startsWith('>')) {
			const nl = packet.indexOf('\n');
			if (nl > -1) {
				roomid = packet.slice(1, nl).trim();
				payload = packet.slice(nl + 1);
			}
		}

		if (roomid) this.rooms.add(roomid);
		const lines = payload.split('\n').filter(Boolean);
		for (const line of lines) {
			for (const handler of this.handlers) handler(roomid, line);
		}
	}
}

function chooseFromRequest(req) {
	if (req.wait) return null;
	if (Array.isArray(req.forceSwitch) && req.forceSwitch.some(Boolean)) {
		const side = req.side && Array.isArray(req.side.pokemon) ? req.side.pokemon : [];
		for (let i = 0; i < side.length; i++) {
			const mon = side[i];
			if (!mon) continue;
			if (mon.active) continue;
			if (mon.condition && mon.condition.endsWith(' fnt')) continue;
			return `switch ${i + 1}`;
		}
		return 'default';
	}

	const active = req.active && req.active[0];
	if (active && Array.isArray(active.moves)) {
		const usable = [];
		for (let i = 0; i < active.moves.length; i++) {
			if (active.moves[i] && !active.moves[i].disabled) usable.push(i + 1);
		}
		if (usable.length) {
			const pick = usable[Math.floor(Math.random() * usable.length)];
			return `move ${pick}`;
		}
	}
	return 'default';
}

async function runConnectionRamp(url, ramp, options) {
	const results = [];
	for (const n of ramp) {
		const clients = [];
		const latencies = [];
		let failures = 0;
		const failureReasons = new Map();

		for (let i = 0; i < n; i++) {
			clients.push(new PSClient(url, `conn-${n}-${i}`, options));
		}

		await Promise.all(clients.map(async c => {
			try {
				const ms = await c.connect(options.connectTimeoutMs);
				latencies.push(ms);
			} catch (err) {
				failures++;
				countReason(failureReasons, normalizeErrorReason(err));
			}
		}));

		await sleep(options.holdMs);
		for (const c of clients) c.close();

		results.push({
			connections: n,
			success: latencies.length,
			failures,
			avgConnectMs: avg(latencies),
			p95ConnectMs: percentile(latencies, 95),
			failureSummary: formatReasonSummary(failureReasons),
		});

		await sleep(options.stepPauseMs);
	}
	return results;
}

async function runBattleRamp(url, ramp, format, options) {
	const results = [];
	for (const battles of ramp) {
		const clients = [];
		const endedRooms = new Set();
		const actionLatencies = [];
		let errors = 0;
		let timedOut = false;
		let queuedPopups = 0;
		const connectFailureReasons = new Map();

		for (let i = 0; i < battles * 2; i++) {
			clients.push(new PSClient(url, `battle-${battles}-${i}`, options));
		}

		await Promise.all(clients.map(async c => {
			try {
				await c.connect(options.connectTimeoutMs);
			} catch (err) {
				errors++;
				countReason(connectFailureReasons, normalizeErrorReason(err));
			}
		}));

		const pendingActionAt = new Map();
		for (const client of clients) {
			client.onMessage((roomid, line) => {
				if (line.startsWith('|popup|')) {
					if (line.includes('The server is busy. You are #')) queuedPopups++;
					return;
				}
				if (!roomid || !roomid.startsWith('battle-')) return;

				if (line.startsWith('|request|')) {
					const key = `${client.id}:${roomid}`;
					const before = pendingActionAt.get(key);
					if (before) {
						actionLatencies.push(performance.now() - before);
						pendingActionAt.delete(key);
					}
					let req;
					try {
						req = JSON.parse(line.slice(9));
					} catch {
						errors++;
						return;
					}
					const choice = chooseFromRequest(req);
					if (!choice) return;
					pendingActionAt.set(key, performance.now());
					client.send(`${roomid}|/choose ${choice}`);
					return;
				}

				if (line.startsWith('|win|') || line.startsWith('|tie|')) {
					endedRooms.add(roomid);
				}
			});
		}

		for (const c of clients) {
			if (!c.connected) continue;
			c.send(`|/search ${format}`);
		}

		const started = Date.now();
		while (endedRooms.size < battles && Date.now() - started < options.waveTimeoutMs) {
			await sleep(250);
		}
		if (endedRooms.size < battles) timedOut = true;

		for (const c of clients) c.close();

		results.push({
			battlesTarget: battles,
			battlesEnded: endedRooms.size,
			actionsMeasured: actionLatencies.length,
			actionAvgMs: avg(actionLatencies),
			actionP95Ms: percentile(actionLatencies, 95),
			errors,
			timedOut,
			queuePopups: queuedPopups,
			connectFailureSummary: formatReasonSummary(connectFailureReasons),
		});

		await sleep(options.stepPauseMs);
	}
	return results;
}

function printTable(title, rows) {
	console.log(`\n=== ${title} ===`);
	if (!rows.length) {
		console.log('(no rows)');
		return;
	}
	const headers = Object.keys(rows[0]);
	const widths = {};
	for (const h of headers) {
		widths[h] = h.length;
		for (const row of rows) {
			widths[h] = Math.max(widths[h], String(row[h]).length);
		}
	}
	const line = headers.map(h => String(h).padEnd(widths[h], ' ')).join(' | ');
	console.log(line);
	console.log(headers.map(h => '-'.repeat(widths[h])).join('-+-'));
	for (const row of rows) {
		console.log(headers.map(h => String(row[h]).padEnd(widths[h], ' ')).join(' | '));
	}
}

function maybeReadHostSample(sshHost) {
	if (!sshHost) return null;
	try {
		const cmd = `ssh -o BatchMode=yes -o ConnectTimeout=3 ${sshHost} "top -bn1 | head -n 5"`;
		return execSync(cmd, {stdio: ['ignore', 'pipe', 'ignore']}).toString();
	} catch {
		return 'SSH sample unavailable (auth/network/command issue).';
	}
}

async function runProbe(url, options) {
	const probeClient = new PSClient(url, 'probe-1', options);
	try {
		const ms = await probeClient.connect(options.connectTimeoutMs);
		console.log(`Probe success: connected in ${fmtMs(ms)}`);
		await sleep(500);
		probeClient.close();
	} catch (err) {
		console.log(`Probe failed: ${normalizeErrorReason(err)}`);
	}
}

async function main() {
	const args = parseArgs(process.argv);
	const host = args.host || 'relumishowdown.dpdns.org';
	const url = args.url || `wss://${host}/showdown/websocket`;
	const format = args.format || 'gen8relumirandomsingles';

	const options = {
		connectTimeoutMs: Number(args['connect-timeout-ms'] || 10000),
		holdMs: Number(args['hold-ms'] || 1500),
		stepPauseMs: Number(args['step-pause-ms'] || 4000),
		waveTimeoutMs: Number(args['wave-timeout-ms'] || 120000),
		allowInsecureTls: args['allow-insecure-tls'] === 'true',
	};

	const connRamp = parseRamp(args['conn-ramp'], [10, 25, 50, 100]);
	const battleRamp = parseRamp(args['battle-ramp'], [2, 5, 10, 20]);

	console.log('Pokemon Showdown load benchmark');
	console.log(`Endpoint: ${url}`);
	console.log(`Format: ${format}`);
	console.log(`Connection ramp: ${connRamp.join(', ')}`);
	console.log(`Battle ramp: ${battleRamp.join(', ')}`);
	if (options.allowInsecureTls) {
		console.log('TLS verification: disabled (--allow-insecure-tls true)');
	}
	console.log('Tip: if using Cloudflare Tunnel, keep step sizes conservative to avoid edge rate limits.');

	if (args.probe === 'true') {
		console.log('\n=== Probe ===');
		await runProbe(url, options);
	}

	const connRaw = await runConnectionRamp(url, connRamp, options);
	const connRows = connRaw.map(r => ({
		connections: r.connections,
		success: r.success,
		failures: r.failures,
		avg_connect: fmtMs(r.avgConnectMs),
		p95_connect: fmtMs(r.p95ConnectMs),
		failure_reason: r.failureSummary || '-',
	}));
	printTable('Concurrent Connections', connRows);

	const battleRaw = await runBattleRamp(url, battleRamp, format, options);
	const battleRows = battleRaw.map(r => ({
		battles_target: r.battlesTarget,
		battles_ended: r.battlesEnded,
		actions_measured: r.actionsMeasured,
		action_avg: fmtMs(r.actionAvgMs),
		action_p95: fmtMs(r.actionP95Ms),
		errors: r.errors,
		timed_out: r.timedOut,
		queue_popups: r.queuePopups,
		connect_failure_reason: r.connectFailureSummary || '-',
	}));
	printTable('Concurrent Battles', battleRows);

	if (args.ssh) {
		console.log('\n=== Optional Host Sample (top -bn1) ===');
		console.log(maybeReadHostSample(args.ssh));
	}
}

main().catch(err => {
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
