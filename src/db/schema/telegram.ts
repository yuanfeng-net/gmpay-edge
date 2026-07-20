import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { supportedLocales } from "#/lib/locales";
import { users } from "./auth";
import { timestamps } from "./common";

export const telegramBots = sqliteTable("telegram_bots", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	tokenEncrypted: text("token_encrypted").notNull(),
	webhookSecretEncrypted: text("webhook_secret_encrypted").notNull(),
	username: text("username"),
	enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
	...timestamps,
});

export const telegramBindings = sqliteTable(
	"telegram_bindings",
	{
		id: text("id").primaryKey(),
		botId: text("bot_id")
			.notNull()
			.references(() => telegramBots.id),
		userId: text("user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		telegramUserId: text("telegram_user_id").notNull(),
		...timestamps,
	},
	(table) => [
		uniqueIndex("telegram_bindings_bot_user_uidx").on(
			table.botId,
			table.telegramUserId,
		),
		index("telegram_bindings_created_idx").on(table.createdAt, table.id),
	],
);

export const telegramNotificationBindings = sqliteTable(
	"telegram_notification_bindings",
	{
		id: text("id").primaryKey(),
		botId: text("bot_id")
			.notNull()
			.references(() => telegramBots.id, { onDelete: "cascade" }),
		templateId: text("template_id").references(
			() => telegramMessageTemplates.id,
			{ onDelete: "set null" },
		),
		name: text("name").notNull(),
		targetType: text("target_type", {
			enum: ["private", "group", "channel"],
		}).notNull(),
		targetId: text("target_id").notNull(),
		locale: text("locale", { enum: supportedLocales })
			.notNull()
			.default("en-US"),
		events: text("events", { mode: "json" }).$type<string[]>().notNull(),
		enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
		...timestamps,
	},
	(table) => [
		uniqueIndex("telegram_notifications_bot_target_uidx").on(
			table.botId,
			table.targetId,
		),
		index("telegram_notifications_event_idx").on(table.botId, table.enabled),
		index("telegram_notifications_created_idx").on(table.createdAt, table.id),
	],
);

export const telegramMessageTemplates = sqliteTable(
	"telegram_message_templates",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		translations: text("translations", { mode: "json" })
			.$type<Record<(typeof supportedLocales)[number], string>>()
			.notNull(),
		enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
		...timestamps,
	},
	(table) => [index("telegram_templates_enabled_idx").on(table.enabled)],
);

export const telegramBotCommands = sqliteTable(
	"telegram_bot_commands",
	{
		id: text("id").primaryKey(),
		command: text("command").notNull(),
		descriptionEnUs: text("description_en_us").notNull(),
		descriptionJaJp: text("description_ja_jp").notNull(),
		descriptionKoKr: text("description_ko_kr").notNull(),
		descriptionRuRu: text("description_ru_ru").notNull(),
		descriptionZhTw: text("description_zh_tw").notNull(),
		descriptionZhCn: text("description_zh_cn").notNull(),
		handlerType: text("handler_type", {
			enum: ["start", "help", "new", "status", "template"],
		}).notNull(),
		templateId: text("template_id").references(
			() => telegramMessageTemplates.id,
			{ onDelete: "set null" },
		),
		scope: text("scope", {
			enum: ["default", "private", "group", "admin"],
		})
			.notNull()
			.default("default"),
		sortOrder: integer("sort_order").notNull().default(100),
		enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
		...timestamps,
	},
	(table) => [
		uniqueIndex("telegram_commands_command_scope_uidx").on(
			table.command,
			table.scope,
		),
		index("telegram_commands_sort_idx").on(table.enabled, table.sortOrder),
	],
);
