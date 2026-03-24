import { BattleStats } from "../battle-stats";

export const handlers: Chat.Handlers = {
	onBattleEnd(battle, winner) {
		void BattleStats.logBattleFromRoomBattle(battle, winner);
	},
};
