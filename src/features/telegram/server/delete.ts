import { DomainError } from "#/lib/domain-error";

export async function deleteTelegramBot(db: D1Database, id: string) {
	const bot = await db
		.prepare(`SELECT b.enabled, COUNT(tb.id) AS binding_count
			FROM telegram_bots b LEFT JOIN telegram_bindings tb ON tb.bot_id = b.id
			WHERE b.id = ? GROUP BY b.id, b.enabled`)
		.bind(id)
		.first<{ enabled: number; binding_count: number }>();
	if (!bot)
		throw new DomainError(
			"telegram_bot_not_found",
			404,
			"Telegram bot not found",
		);
	if (bot.enabled)
		throw new DomainError(
			"telegram_bot_enabled",
			409,
			"Disable the Telegram bot before deleting it",
		);
	if (bot.binding_count > 0)
		throw new DomainError(
			"telegram_bot_has_bindings",
			409,
			"Delete the Telegram bot bindings before deleting the bot",
		);
	await db.prepare("DELETE FROM telegram_bots WHERE id = ?").bind(id).run();
	return { id };
}
