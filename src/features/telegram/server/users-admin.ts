import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { systemPermission } from "#/features/access/system-rbac";
import {
	telegramAdminContext,
	telegramAuditStatement,
} from "#/features/telegram/server/admin-context";

export type TelegramBindingRecord = {
	id: string;
	botId: string;
	botName: string;
	telegramUserId: string;
	createdAt: string;
};

type TelegramBindingRow = {
	id: string;
	bot_id: string;
	bot_name: string;
	telegram_user_id: string;
	created_at: number;
};

const listBindingsInput = z.object({
	pageIndex: z.number().int().min(0).default(0),
	pageSize: z.number().int().min(1).max(100).default(10),
	search: z.string().trim().max(200).default(""),
	beforeCreatedAt: z.number().int().positive(),
});

export const listTelegramBindingsFn = createServerFn({ method: "GET" })
	.validator((input) => listBindingsInput.parse(input))
	.handler(async ({ data }) => {
		const { db } = await telegramAdminContext(
			systemPermission("telegram", "read"),
		);
		const search = data.search ? `%${data.search}%` : null;
		const where = search
			? "WHERE tb.created_at <= ? AND (tb.telegram_user_id LIKE ? OR b.name LIKE ?)"
			: "WHERE tb.created_at <= ?";
		const parameters = search
			? [data.beforeCreatedAt, search, search]
			: [data.beforeCreatedAt];
		const [countResult, rowsResult] = await db.batch([
			db
				.prepare(`SELECT COUNT(*) AS total
					FROM telegram_bindings tb
					JOIN telegram_bots b ON b.id = tb.bot_id ${where}`)
				.bind(...parameters),
			db
				.prepare(`SELECT tb.id, tb.bot_id, b.name AS bot_name,
					tb.telegram_user_id, tb.created_at
					FROM telegram_bindings tb
					JOIN telegram_bots b ON b.id = tb.bot_id ${where}
					ORDER BY tb.created_at DESC, tb.id DESC LIMIT ? OFFSET ?`)
				.bind(...parameters, data.pageSize, data.pageIndex * data.pageSize),
		]);
		return {
			data: (rowsResult as D1Result<TelegramBindingRow>).results.map(
				(row): TelegramBindingRecord => ({
					id: row.id,
					botId: row.bot_id,
					botName: row.bot_name,
					telegramUserId: row.telegram_user_id,
					createdAt: new Date(row.created_at).toISOString(),
				}),
			),
			total:
				(countResult?.results[0] as { total: number } | undefined)?.total ?? 0,
		};
	});

const bindingIdInput = z.object({ id: z.string().uuid() });

export const deleteTelegramBindingFn = createServerFn({ method: "POST" })
	.validator((input: z.input<typeof bindingIdInput>) =>
		bindingIdInput.parse(input),
	)
	.handler(async ({ data }) => {
		const context = await telegramAdminContext(
			systemPermission("telegram", "delete"),
		);
		await context.db.batch([
			context.db
				.prepare("DELETE FROM telegram_bindings WHERE id = ?")
				.bind(data.id),
			telegramAuditStatement(
				context,
				"telegram_binding.deleted",
				"telegram_binding",
				data.id,
				null,
			),
		]);
		return data;
	});
