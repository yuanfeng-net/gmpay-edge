import { describe, expect, it } from "vitest";
import { selectTelegramTemplate } from "#/features/telegram/server/telegram";

const templates = [
	{
		template_id: "notice",
		translations: { "zh-CN": "中文", "en-US": "English" },
	},
	{ template_id: "other", translations: { "zh-CN": "其他" } },
];

describe("Telegram reusable template selection", () => {
	it("selects the referenced template in the target locale then English", () => {
		expect(selectTelegramTemplate(templates, "notice", "zh-CN")?.content).toBe(
			"中文",
		);
		expect(selectTelegramTemplate(templates, "notice", "zh-TW")?.content).toBe(
			"English",
		);
	});

	it("does not select an unrelated or missing template", () => {
		expect(
			selectTelegramTemplate(templates, "missing", "zh-CN"),
		).toBeUndefined();
		expect(selectTelegramTemplate(templates, null, "zh-CN")).toBeUndefined();
	});
});
