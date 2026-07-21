import { type SupportedLocale, supportedLocales } from "#/lib/locales";

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
