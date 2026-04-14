export const handlers: Chat.Handlers = {
	onBattleEnd() {
		Ladders.processQueuedBattles();
	},
};

export const commands: Chat.ChatCommands = {
	queueinfo(target, room, user) {
		this.checkCan('lockdown');
		const info = Ladders.getQueueInfo();
		if (!info.cap) {
			this.sendReply(`Battle queue is disabled (set Config.maxconcurrentbattles > 0 to enable).`);
			return;
		}
		const oldestWait = info.oldestQueueMs ? Chat.toDurationString(info.oldestQueueMs) : '0 seconds';
		this.sendReplyBox(
			`<strong>Battle queue:</strong><br />` +
			`Concurrent cap: ${info.cap}<br />` +
			`Active battles: ${info.activeBattles}<br />` +
			`Queued matches: ${info.queuedMatches}<br />` +
			`Queued users: ${info.queuedUsers}<br />` +
			`Oldest wait: ${oldestWait}`
		);
	},
	queueinfohelp: [
		`/queueinfo - Shows concurrent battle cap and queue status. Requires: ~`,
	],
};
