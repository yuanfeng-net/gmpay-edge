import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { systemPermission } from "#/features/access/system-rbac";
import { telegramTemplateInput } from "#/features/telegram/schema";
import {
	telegramAdminContext,
	telegramAuditStatement,
} from "#/features/telegram/server/admin-context";
import { requireTelegramResource } from "#/features/telegram/server/resource-errors";
import {
	mapTelegramTemplates,
	type TelegramTemplateRow,
} from "#/features/telegram/server/template-catalog";

export type { TelegramTemplateRecord } from "#/features/telegram/server/template-catalog";

const listTemplatesInput = z.object({
	pageIndex: z.number().int().min(0).default(0),
	pageSize: z.number().int().min(1).max(100).default(10),
	search: z.string().trim().max(200).default(""),
	beforeCreatedAt: z.number().int().positive(),
});

export const listTelegramTemplatesFn = createServerFn({ method: "GET" })
	.validator((input) => listTemplatesInput.parse(input))
	.handler(async ({ data }) => {
		const { db } = await telegramAdminContext(
			systemPermission("telegram", "read"),
		);
		const search = data.search ? `%${data.search}%` : null;
		const where = search
			? "WHERE created_at <= ? AND name LIKE ?"
			: "WHERE created_at <= ?";
		const parameters = search
			? [data.beforeCreatedAt, search]
			: [data.beforeCreatedAt];
		const [countResult, rowsResult] = await db.batch([
			db
				.prepare(
					`SELECT COUNT(*) AS total FROM telegram_message_templates ${where}`,
				)
				.bind(...parameters),
			db
				.prepare(`SELECT id, name, translations, enabled, created_at
					FROM telegram_message_templates
					WHERE id IN (
						SELECT id FROM telegram_message_templates ${where}
						ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
					)
					ORDER BY created_at DESC, id DESC`)
				.bind(...parameters, data.pageSize, data.pageIndex * data.pageSize),
		]);
		return {
			data: mapTelegramTemplates(
				(rowsResult as D1Result<TelegramTemplateRow>).results,
			),
			total:
				(countResult?.results[0] as { total: number } | undefined)?.total ?? 0,
		};
	});

export const createTelegramTemplateFn = createServerFn({ method: "POST" })
	.validator((input: z.input<typeof telegramTemplateInput>) =>
		telegramTemplateInput.parse(input),
	)
	.handler(async ({ data }) => {
		const context = await telegramAdminContext(
			systemPermission("telegram", "create"),
		);
		const now = Date.now();
		const id = crypto.randomUUID();
		await context.db.batch([
			context.db
				.prepare(
					"INSERT INTO telegram_message_templates (id, name, translations, enabled, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
				)
				.bind(id, data.name, JSON.stringify(data.translations), now, now),
			telegramAuditStatement(
				context,
				"telegram_template.created",
				"telegram_message_template",
				id,
				{ ...data, translations: "[REDACTED]" },
				now,
			),
		]);
		return { id };
	});

const templateUpdateInput = telegramTemplateInput.extend({
	id: z.string().trim().min(1),
});

export const updateTelegramTemplateFn = createServerFn({ method: "POST" })
	.validator((input: z.input<typeof templateUpdateInput>) =>
		templateUpdateInput.parse(input),
	)
	.handler(async ({ data }) => {
		const context = await telegramAdminContext(
			systemPermission("telegram", "update"),
		);
		await requireTemplate(context.db, data.id);
		const now = Date.now();
		await context.db.batch([
			context.db
				.prepare(
					"UPDATE telegram_message_templates SET name = ?, translations = ?, updated_at = ? WHERE id = ?",
				)
				.bind(data.name, JSON.stringify(data.translations), now, data.id),
			telegramAuditStatement(
				context,
				"telegram_template.updated",
				"telegram_message_template",
				data.id,
				{ ...data, translations: "[REDACTED]" },
				now,
			),
		]);
		return { id: data.id };
	});

const templateStateInput = z.object({
	id: z.string().trim().min(1),
	enabled: z.boolean(),
});

export const setTelegramTemplateEnabledFn = createServerFn({ method: "POST" })
	.validator((input: z.input<typeof templateStateInput>) =>
		templateStateInput.parse(input),
	)
	.handler(async ({ data }) => {
		const context = await telegramAdminContext(
			systemPermission("telegram", "update"),
		);
		await requireTemplate(context.db, data.id);
		const now = Date.now();
		await context.db.batch([
			context.db
				.prepare(
					"UPDATE telegram_message_templates SET enabled = ?, updated_at = ? WHERE id = ?",
				)
				.bind(data.enabled, now, data.id),
			telegramAuditStatement(
				context,
				"telegram_template.enabled_changed",
				"telegram_template",
				data.id,
				{ enabled: data.enabled },
				now,
			),
		]);
		return data;
	});

const templateIdInput = z.object({ id: z.string().trim().min(1) });

export const deleteTelegramTemplateFn = createServerFn({ method: "POST" })
	.validator((input: z.input<typeof templateIdInput>) =>
		templateIdInput.parse(input),
	)
	.handler(async ({ data }) => {
		const context = await telegramAdminContext(
			systemPermission("telegram", "delete"),
		);
		await requireTemplate(context.db, data.id);
		await context.db.batch([
			context.db
				.prepare("DELETE FROM telegram_message_templates WHERE id = ?")
				.bind(data.id),
			telegramAuditStatement(
				context,
				"telegram_template.deleted",
				"telegram_message_template",
				data.id,
				null,
			),
		]);
		return data;
	});

async function requireTemplate(db: D1Database, id: string) {
	const template = await db
		.prepare("SELECT id FROM telegram_message_templates WHERE id = ? LIMIT 1")
		.bind(id)
		.first<{ id: string }>();
	return requireTelegramResource(template, "template");
}
