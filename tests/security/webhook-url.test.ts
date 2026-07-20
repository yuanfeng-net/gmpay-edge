import { describe, expect, it } from "vitest";
import { isSafeWebhookUrl } from "#/lib/webhook-url";

describe("webhook URL validation", () => {
	it("accepts public HTTPS endpoints", () => {
		expect(isSafeWebhookUrl("https://merchant.example/webhooks/gmpay")).toBe(
			true,
		);
	});

	it.each([
		"http://merchant.example/webhook",
		"https://localhost/webhook",
		"https://127.0.0.1/webhook",
		"https://10.0.0.4/webhook",
		"https://192.168.1.3/webhook",
		"https://169.254.169.254/latest/meta-data",
		"https://[::1]/webhook",
		"https://[::ffff:127.0.0.1]/webhook",
		"https://[::ffff:10.0.0.4]/webhook",
		"https://[::ffff:100.64.0.1]/webhook",
		"https://[::ffff:169.254.169.254]/webhook",
		"https://[::ffff:172.16.0.1]/webhook",
		"https://[::ffff:192.168.1.3]/webhook",
		"https://[::ffff:224.0.0.1]/webhook",
		"https://user:password@merchant.example/webhook",
	])("rejects unsafe endpoint %s", (url) => {
		expect(isSafeWebhookUrl(url)).toBe(false);
	});
});
