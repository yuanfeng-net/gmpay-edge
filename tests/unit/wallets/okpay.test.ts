import { afterEach, describe, expect, it, vi } from "vitest";
import { OkPayAdapter } from "#/integrations/wallets/okpay";
import createFixture from "../../fixtures/providers/okpay-create-payment.json";
import statusFixture from "../../fixtures/providers/okpay-payment-status.json";

describe("OKPay adapter", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("creates a signed hosted checkout", async () => {
		const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
		vi.spyOn(Math, "random").mockReturnValue(0);
		const fetchMock = vi.fn().mockResolvedValue(Response.json(createFixture));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			adapter().createHostedPayment({
				orderId: "order-1",
				amount: "3.5",
				assetCode: "USDT",
				description: "Order 1",
				returnUrl: "https://merchant.example/return",
			}),
		).resolves.toEqual({
			providerOrderId: "ok-order",
			paymentUrl: "https://pay.example/order",
		});

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.okaypay.me/shop/payLink");
		const body = new URLSearchParams(String(init.body));
		expect(body.get("id")).toBe("12345");
		expect(body.get("unique_id")).toBe("order-1");
		expect(body.get("sign")).toMatch(/^[A-F0-9]{32}$/);
		expect(info).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "provider_operation",
				adapter: "okpay",
				operation: "create_hosted_payment",
				outcome: "success",
				requestCount: 1,
			}),
		);
	});

	it("checks and normalizes a completed hosted payment", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(Response.json(statusFixture)),
		);

		await expect(
			adapter().checkHostedPayment("ok-order"),
		).resolves.toMatchObject({
			hash: "ok-order",
			assetCode: "USDT",
			amountUnits: 350_000_000n,
			to: "12345",
			success: true,
		});
	});

	it("rejects an unsafe hosted checkout URL", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				Response.json({
					data: { order_id: "provider-order", pay_url: "javascript:alert(1)" },
				}),
			),
		);
		await expect(
			adapter().createHostedPayment({
				orderId: "order-unsafe",
				amount: "1.00",
				assetCode: "USDT",
				description: "Unsafe URL",
			}),
		).rejects.toThrow("safe pay URL");
	});

	it("ignores a completed provider response with a non-positive amount", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				Response.json({
					data: {
						amount: "-1",
						coin: "USDT",
						order_id: "negative-order",
						status: 1,
						unique_id: "order-negative",
					},
				}),
			),
		);

		expect(await adapter().checkHostedPayment("negative-order")).toBeNull();
	});

	it("rejects numeric callback amounts instead of risking precision loss", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				Response.json({
					data: {
						amount: 1.25,
						coin: "USDT",
						order_id: "numeric-order",
						status: 1,
						unique_id: "order-numeric",
					},
				}),
			),
		);
		await expect(
			adapter().checkHostedPayment("numeric-order"),
		).rejects.toThrow();
	});

	it("verifies signed callbacks and extracts nested notification data", async () => {
		const instance = adapter();
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				Response.json({
					data: { order_id: "unused", pay_url: "https://pay" },
				}),
			),
		);
		await instance.createHostedPayment({
			orderId: "order-1",
			amount: "3.5",
			assetCode: "USDT",
			description: "Order 1",
		});
		const callback = {
			amount: "3.5",
			coin: "USDT",
			id: "12345",
			order_id: "ok-order",
			unique_id: "order-1",
			sign: "D7BD108A3CAABFB15D7A2D0AF918A76B",
		};
		expect(instance.verifyCallback(callback)).toBe(true);
		expect(instance.parseCallback(callback)).toEqual({
			amount: "3.5",
			assetCode: "USDT",
			providerOrderId: "ok-order",
			orderId: "order-1",
		});
	});

	it("redacts unexpected provider failures from health details", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockRejectedValue(new TypeError("provider-secret-and-url")),
		);

		const health = await adapter().healthCheck();

		expect(health).toMatchObject({
			healthy: false,
			detail: "OKPay health check failed: network",
		});
		expect(health.detail).not.toContain("provider-secret-and-url");
	});
});

function adapter() {
	return new OkPayAdapter({
		shopId: "12345",
		apiKey: "secret",
		apiUrl: "https://api.okaypay.me/shop",
		assetDecimals: { USDT: 8 },
	});
}
