import { describe, expect, it } from "vitest";
import { telegramTemplateInput } from "#/features/telegram/schema";

describe("Telegram message template input", () => {
	it("accepts one reusable template with every supported locale", () => {
		const template = {
			name: "Default English",
			translations: Object.fromEntries(
				["en-US", "ja-JP", "ko-KR", "ru-RU", "zh-TW", "zh-CN"].map((locale) => [
					locale,
					"Order {{externalOrderId}} is {{status}}",
				]),
			),
		};
		expect(telegramTemplateInput.parse(template)).toEqual(template);
		expect(
			telegramTemplateInput.safeParse({
				...template,
				translations: { ...template.translations, "zh-CN": "" },
			}).success,
		).toBe(false);
	});

	it("rejects unsupported template variables", () => {
		expect(
			telegramTemplateInput.safeParse({
				name: "Unsafe",
				translations: {
					"en-US": "Safe",
					"ja-JP": "Safe",
					"ko-KR": "Safe",
					"ru-RU": "Safe",
					"zh-TW": "Safe",
					"zh-CN": "{{process.env.SECRET}}",
				},
			}).success,
		).toBe(false);
	});
});
