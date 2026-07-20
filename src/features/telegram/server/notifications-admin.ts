import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { systemPermission } from "#/features/access/system-rbac";
import {
	telegramAdminContext,
	telegramAuditStatement,
	telegramSettingUpsert,
} from "#/features/telegram/server/admin-context";
import {
	requireTelegramResource,
	requireTelegramResourceAvailable,
} from "#/features/telegram/server/resource-errors";
import {
	mapTelegramTemplates,
	type TelegramTemplateRow,
} from "#/features/telegram/server/template-catalog";
import { webhookEventTypes } from "#/features/webhooks/types";
import { type SupportedLocale, supportedLocales } from "#/lib/locales";

export type TelegramNotificationBindingRecord = {
	id: string;
	botId: string;
	botName: string;
	templateId: string | null;
	templateName: string | null;
	name: string;
	targetType: "private" | "group" | "channel";
	targetId: string;
	locale: SupportedLocale;
	events: string[];
	enabled: boolean;
	createdAt: string;
};

type TelegramTargetRow = {
	id: string;
	bot_id: string;
	bot_name: string;
	template_id: string | null;
	template_name: string | null;
	name: string;
	target_type: "private" | "group" | "channel";
	target_id: string;
	locale: SupportedLocale;
	events: string;
	enabled: number;
	created_at: number;
};

const listNotificationsInput = z.object({
	pageIndex: z.number().int().min(0).default(0),
	pageSize: z.number().int().min(1).max(100).default(10),
	search: z.string().trim().max(200).default(""),
	beforeCreatedAt: z.number().int().positive(),
});

export const listTelegramNotificationsFn = createServerFn({ method: "GET" })
	.validator((input) => listNotificationsInput.parse(input))
	.handler(async ({ data }) => {
		const { db } = await telegramAdminContext(
			systemPermission("telegram", "read"),
		);
		const search = data.search ? `%${data.search}%` : null;
		const where = search
			? "WHERE target.created_at <= ? AND (target.name LIKE ? OR target.target_id LIKE ? OR b.name LIKE ?)"
			: "WHERE target.created_at <= ?";
		const parameters = search
			? [data.beforeCreatedAt, search, search, search]
			: [data.beforeCreatedAt];
		const [
			countResult,
			targetsResult,
			botsResult,
			templatesResult,
			settingsResult,
		] = await db.batch([
			db
				.prepare(`SELECT COUNT(*) AS total
					FROM telegram_notification_bindings target
					JOIN telegram_bots b ON b.id = target.bot_id ${where}`)
				.bind(...parameters),
			db
				.prepare(`SELECT target.id, target.bot_id, b.name AS bot_name,
					target.template_id, template.name AS template_name, target.name,
					target.target_type, target.target_id, target.locale, target.events,
					target.enabled, target.created_at
					FROM telegram_notification_bindings target
					JOIN telegram_bots b ON b.id = target.bot_id
					LEFT JOIN telegram_message_templates template
					ON template.id = target.template_id ${where}
					ORDER BY target.created_at DESC, target.id DESC LIMIT ? OFFSET ?`)
				.bind(...parameters, data.pageSize, data.pageIndex * data.pageSize),
			db.prepare("SELECT id, name FROM telegram_bots ORDER BY name, id"),
			db.prepare(`SELECT id, name, translations, enabled, created_at
				FROM telegram_message_templates ORDER BY name`),
			db.prepare(
				"SELECT key, value FROM system_settings WHERE key IN ('telegram.auto_subscribe_on_start', 'telegram.default_events', 'telegram.default_template_id')",
			),
		]);
		const settings = new Map(
			(settingsResult as D1Result<{ key: string; value: string }>).results.map(
				(row) => [row.key, row.value],
			),
		);
		return {
			data: (targetsResult as D1Result<TelegramTargetRow>).results.map(
				(row): TelegramNotificationBindingRecord => ({
					id: row.id,
					botId: row.bot_id,
					botName: row.bot_name,
					templateId: row.template_id,
					templateName: row.template_name,
					name: row.name,
					targetType: row.target_type,
					targetId: row.target_id,
					locale: row.locale,
					events: parseEvents(row.events),
					enabled: Boolean(row.enabled),
					createdAt: new Date(row.created_at).toISOString(),
				}),
			),
			total:
				(countResult?.results[0] as { total: number } | undefined)?.total ?? 0,
			bots: (botsResult as D1Result<{ id: string; name: string }>).results,
			templates: mapTelegramTemplates(
				(templatesResult as D1Result<TelegramTemplateRow>).results,
			),
			defaults: {
				autoSubscribe: parseBooleanSetting(
					settings.get("telegram.auto_subscribe_on_start"),
					false,
				),
				events: parseEventSetting(settings.get("telegram.default_events"), [
					"order.paid",
					"order.expired",
				]),
				templateId: parseStringSetting(
					settings.get("telegram.default_template_id"),
					"telegram-template-notifications",
				),
			},
		};
	});

const notificationTargetInput = z.object({
	botId: z.string().uuid(),
	templateId: z.string().trim().min(1),
	name: z.string().trim().min(2).max(80),
	targetType: z.enum(["private", "group", "channel"]),
	targetId: z
		.string()
		.trim()
		.regex(/^-?\d+$/),
	locale: z.enum(supportedLocales),
	events: z
		.array(z.enum(webhookEventTypes))
		.min(1)
		.max(webhookEventTypes.length),
});

export const createTelegramNotificationBindingFn = createServerFn({
	method: "POST",
})
	.validator((input: z.input<typeof notificationTargetInput>) =>
		notificationTargetInput.parse(input),
	)
	.handler(async ({ data }) => {
		const context = await telegramAdminContext(
			systemPermission("telegram", "create"),
		);
		await requireEnabledTemplate(context.db, data.templateId);
		const [botResult, existingResult] = await context.db.batch([
			context.db
				.prepare("SELECT id FROM telegram_bots WHERE id = ? LIMIT 1")
				.bind(data.botId),
			context.db
				.prepare(
					"SELECT id FROM telegram_notification_bindings WHERE bot_id = ? AND target_id = ? LIMIT 1",
				)
				.bind(data.botId, data.targetId),
		]);
		requireTelegramResource(botResult?.results[0], "bot");
		requireTelegramResourceAvailable(
			existingResult?.results[0],
			"notification",
		);
		const id = crypto.randomUUID();
		const now = Date.now();
		const events = [...new Set(data.events)];
		await context.db.batch([
			context.db
				.prepare(
					"INSERT INTO telegram_notification_bindings (id, bot_id, template_id, name, target_type, target_id, locale, events, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
				)
				.bind(
					id,
					data.botId,
					data.templateId,
					data.name,
					data.targetType,
					data.targetId,
					data.locale,
					JSON.stringify(events),
					now,
					now,
				),
			telegramAuditStatement(
				context,
				"telegram_target.created",
				"telegram_notification_target",
				id,
				{ ...data, events },
				now,
			),
		]);
		return { id };
	});

const notificationStateInput = z.object({
	id: z.string().uuid(),
	enabled: z.boolean(),
});

export const setTelegramNotificationEnabledFn = createServerFn({
	method: "POST",
})
	.validator((input: z.input<typeof notificationStateInput>) =>
		notificationStateInput.parse(input),
	)
	.handler(async ({ data }) => {
		const context = await telegramAdminContext(
			systemPermission("telegram", "update"),
		);
		const current = await context.db
			.prepare(
				"SELECT id FROM telegram_notification_bindings WHERE id = ? LIMIT 1",
			)
			.bind(data.id)
			.first<{ id: string }>();
		requireTelegramResource(current, "notification");
		const now = Date.now();
		await context.db.batch([
			context.db
				.prepare(
					"UPDATE telegram_notification_bindings SET enabled = ?, updated_at = ? WHERE id = ?",
				)
				.bind(data.enabled, now, data.id),
			telegramAuditStatement(
				context,
				"telegram_target.enabled_changed",
				"telegram_notification_target",
				data.id,
				{ enabled: data.enabled },
				now,
			),
		]);
		return data;
	});

const telegramDefaultsInput = z.object({
	autoSubscribe: z.boolean(),
	events: z.array(z.enum(webhookEventTypes)).max(webhookEventTypes.length),
	templateId: z.string().trim().min(1),
});

export const updateTelegramDefaultsFn = createServerFn({ method: "POST" })
	.validator((input: z.input<typeof telegramDefaultsInput>) =>
		telegramDefaultsInput.parse(input),
	)
	.handler(async ({ data }) => {
		const context = await telegramAdminContext(
			systemPermission("telegram", "update"),
		);
		await requireEnabledTemplate(context.db, data.templateId);
		const now = Date.now();
		const events = [...new Set(data.events)];
		await context.db.batch([
			telegramSettingUpsert(
				context.db,
				"telegram.auto_subscribe_on_start",
				data.autoSubscribe,
				context.user.id,
				now,
			),
			telegramSettingUpsert(
				context.db,
				"telegram.default_events",
				events,
				context.user.id,
				now,
			),
			telegramSettingUpsert(
				context.db,
				"telegram.default_template_id",
				data.templateId,
				context.user.id,
				now,
			),
			telegramAuditStatement(
				context,
				"telegram.defaults_updated",
				"telegram_defaults",
				"start",
				{
					autoSubscribe: data.autoSubscribe,
					events,
					templateId: data.templateId,
				},
				now,
			),
		]);
		return { ...data, events };
	});

const notificationIdInput = z.object({ id: z.string().uuid() });

export const deleteTelegramNotificationBindingFn = createServerFn({
	method: "POST",
})
	.validator((input: z.input<typeof notificationIdInput>) =>
		notificationIdInput.parse(input),
	)
	.handler(async ({ data }) => {
		const context = await telegramAdminContext(
			systemPermission("telegram", "delete"),
		);
		await context.db.batch([
			context.db
				.prepare("DELETE FROM telegram_notification_bindings WHERE id = ?")
				.bind(data.id),
			telegramAuditStatement(
				context,
				"telegram_target.deleted",
				"telegram_notification_target",
				data.id,
				null,
			),
		]);
		return data;
	});

async function requireEnabledTemplate(db: D1Database, id: string) {
	const template = await db
		.prepare(
			"SELECT id FROM telegram_message_templates WHERE id = ? AND enabled = 1 LIMIT 1",
		)
		.bind(id)
		.first<{ id: string }>();
	return requireTelegramResource(template, "template");
}

function parseEvents(value: string) {
	try {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) &&
			parsed.every((item) => typeof item === "string")
			? parsed
			: [];
	} catch {
		return [];
	}
}

function isWebhookEventType(
	value: string,
): value is (typeof webhookEventTypes)[number] {
	return webhookEventTypes.includes(
		value as (typeof webhookEventTypes)[number],
	);
}

function parseSetting(value: string | undefined): unknown {
	if (!value) return undefined;
	try {
		const parsed: unknown = JSON.parse(value);
		return parsed;
	} catch {
		return undefined;
	}
}

function parseBooleanSetting(value: string | undefined, fallback: boolean) {
	const parsed = parseSetting(value);
	return typeof parsed === "boolean" ? parsed : fallback;
}

function parseStringSetting(value: string | undefined, fallback: string) {
	const parsed = parseSetting(value);
	return typeof parsed === "string" ? parsed : fallback;
}

function parseEventSetting(value: string | undefined, fallback: string[]) {
	const parsed = parseSetting(value);
	return Array.isArray(parsed)
		? parsed.filter(
				(item): item is (typeof webhookEventTypes)[number] =>
					typeof item === "string" && isWebhookEventType(item),
			)
		: fallback;
}
