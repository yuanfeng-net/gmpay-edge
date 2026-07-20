import { type SupportedLocale, supportedLocales } from "#/lib/locales";

export type TelegramTemplateRecord = {
	id: string;
	name: string;
	translations: Record<SupportedLocale, string>;
	enabled: boolean;
	createdAt: string;
};

export type TelegramTemplateRow = {
	id: string;
	name: string;
	translations: unknown;
	enabled: number;
	created_at: number;
};

export function mapTelegramTemplates(
	rows: readonly TelegramTemplateRow[],
): TelegramTemplateRecord[] {
	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		translations: parseTelegramTemplateTranslations(row.translations),
		enabled: Boolean(row.enabled),
		createdAt: new Date(row.created_at).toISOString(),
	}));
}

export function parseTelegramTemplateTranslations(value: unknown) {
	let candidate = value;
	if (typeof value === "string") {
		try {
			candidate = JSON.parse(value);
		} catch {
			candidate = null;
		}
	}
	const source =
		candidate && typeof candidate === "object" && !Array.isArray(candidate)
			? (candidate as Record<string, unknown>)
			: {};
	return Object.fromEntries(
		supportedLocales.map((locale) => [
			locale,
			typeof source[locale] === "string" ? source[locale] : "",
		]),
	) as Record<SupportedLocale, string>;
}

export async function listTelegramTemplateOptions(db: D1Database) {
	const rows = await db
		.prepare(`SELECT id, name, translations, enabled, created_at
			FROM telegram_message_templates ORDER BY name`)
		.all<TelegramTemplateRow>();
	return mapTelegramTemplates(rows.results);
}
