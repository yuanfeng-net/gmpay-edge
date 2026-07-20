import { afterEach, describe, expect, it, vi } from "vitest";
import { BinancePayAdapter } from "#/integrations/exchanges/binance";
import { OkxPayAdapter } from "#/integrations/exchanges/okx";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	vi.restoreAllMocks();
});

describe("Binance Pay adapter", () => {
	it("scans signed read-only history and normalizes decimal amounts", async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					code: "000000",
					success: true,
					data: [
						{
							fundsDetail: [{ amount: "12.5", currency: "USDT" }],
							receiverInfo: { binanceId: "123456" },
							transactionId: "pay-1",
							transactionTime: 1_700_000_000_000,
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			),
		);
		globalThis.fetch = fetchMock;
		const adapter = new BinancePayAdapter({
			apiKey: "key",
			secretKey: "secret",
			lookbackMs: 60_000,
		});

		const transactions = await adapter.findTransactions({
			address: "123456",
			assetCode: "USDT",
		});

		expect(transactions[0]).toMatchObject({
			hash: "pay-1",
			assetCode: "USDT",
			amountUnits: 1_250_000_000n,
			canonical: true,
		});
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(String(url)).toContain("/sapi/v1/pay/transactions?");
		expect((init?.headers as Record<string, string>)["X-MBX-APIKEY"]).toBe(
			"key",
		);
		expect(init?.method).toBeUndefined();
	});

	it("classifies authentication and rate-limit failures", async () => {
		const adapter = new BinancePayAdapter({
			apiKey: "key",
			secretKey: "secret",
		});
		globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(JSON.stringify({ code: -2015, msg: "invalid" }), {
				status: 401,
			}),
		);
		await expect(
			adapter.findTransactions({ address: "123456", assetCode: "USDT" }),
		).rejects.toThrow();
		const error = await (async () => {
			try {
				await adapter.findTransactions({
					address: "123456",
					assetCode: "USDT",
				});
			} catch (caught) {
				return caught;
			}
		})();
		expect(adapter.classifyError(error)).toBe("authentication");
		expect(adapter.isRetryable("rate_limit")).toBe(true);
	});

	it("shares one deadline across a slow paginated history scan", async () => {
		let now = 0;
		vi.spyOn(Date, "now").mockImplementation(() => now);
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockImplementation(async (_url, init) => {
				if (init?.signal?.aborted) throw init.signal.reason;
				now = 1_001;
				return binanceHistoryResponse(100);
			});
		globalThis.fetch = fetchMock;
		const adapter = new BinancePayAdapter({
			apiKey: "key",
			secretKey: "secret",
			lookbackMs: 60_000,
			maxHistoryRequests: 10,
			timeoutMs: 1_000,
		});

		await expect(
			adapter.findTransactions({ address: "123456", assetCode: "USDT" }),
		).rejects.toMatchObject({ name: "TimeoutError" });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const secondSignal = fetchMock.mock.calls[1]?.[1]?.signal;
		expect(secondSignal?.aborted).toBe(true);
	});

	it("allows only one clock correction across the whole history scan", async () => {
		let historyRequests = 0;
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockImplementation(async (input) => {
				const url = String(input);
				if (url.includes("/api/v3/time"))
					return Response.json({ serverTime: Date.now() + 1_000 });
				historyRequests += 1;
				if (historyRequests === 1)
					return Response.json({ code: -1021 }, { status: 400 });
				if (historyRequests === 2) return binanceHistoryResponse(100);
				return Response.json({ code: -1021 }, { status: 400 });
			});
		globalThis.fetch = fetchMock;

		await expect(
			new BinancePayAdapter({
				apiKey: "key",
				secretKey: "secret",
				lookbackMs: 60_000,
				maxHistoryRequests: 10,
			}).findTransactions({ address: "123456", assetCode: "USDT" }),
		).rejects.toThrow("Binance returned HTTP 400");
		expect(historyRequests).toBe(3);
		expect(
			fetchMock.mock.calls.filter(([url]) =>
				String(url).includes("/api/v3/time"),
			),
		).toHaveLength(1);
		expect(fetchMock).toHaveBeenCalledTimes(4);
	});

	it("redacts unexpected provider failures from health details", async () => {
		globalThis.fetch = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new TypeError("provider-secret-and-url"));

		const health = await new BinancePayAdapter({
			apiKey: "key",
			secretKey: "secret",
		}).healthCheck();

		expect(health).toMatchObject({
			healthy: false,
			detail: "Binance health check failed: network",
		});
		expect(health.detail).not.toContain("provider-secret-and-url");
	});
});

describe("OKX adapter", () => {
	it("scans funding bills with a cursor and never enables trading", async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					code: "0",
					data: [
						{
							balChg: "12.5",
							billId: "bill-1",
							ccy: "USDT",
							ts: "1700000000000",
							type: "72",
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			),
		);
		globalThis.fetch = fetchMock;
		const adapter = new OkxPayAdapter({
			apiKey: "key",
			secretKey: "secret",
			passphrase: "passphrase",
			accountId: "888777",
		});

		const transactions = await adapter.findTransactions({
			address: "888777",
			assetCode: "USDT",
			sinceBlock: 0n,
		});
		expect(transactions[0]).toMatchObject({
			hash: "bill-1",
			amountUnits: 1_250_000_000n,
			canonical: true,
		});
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(String(url)).toContain("/api/v5/asset/bills?");
		expect((init?.headers as Record<string, string>)["OK-ACCESS-KEY"]).toBe(
			"key",
		);
		expect(init?.method).toBeUndefined();
	});

	it("shares one deadline across slow funding-bill pages", async () => {
		let now = 0;
		vi.spyOn(Date, "now").mockImplementation(() => now);
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockImplementation(async (_url, init) => {
				if (init?.signal?.aborted) throw init.signal.reason;
				now = 1_001;
				return okxBillsResponse(100);
			});
		globalThis.fetch = fetchMock;
		const adapter = new OkxPayAdapter({
			apiKey: "key",
			secretKey: "secret",
			passphrase: "passphrase",
			accountId: "888777",
			maxPages: 10,
			timeoutMs: 1_000,
		});

		await expect(
			adapter.findTransactions({
				address: "888777",
				assetCode: "USDT",
				sinceBlock: 0n,
			}),
		).rejects.toMatchObject({ name: "TimeoutError" });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
	});

	it("allows only one clock correction across funding-bill pages", async () => {
		let billRequests = 0;
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockImplementation(async (input) => {
				const url = String(input);
				if (url.includes("/api/v5/public/time"))
					return Response.json({
						code: "0",
						data: [{ ts: String(Date.now()) }],
					});
				billRequests += 1;
				if (billRequests === 1)
					return Response.json({ code: "50102", data: [] });
				if (billRequests === 2) return okxBillsResponse(100);
				return Response.json({ code: "50102", data: [] });
			});
		globalThis.fetch = fetchMock;

		await expect(
			new OkxPayAdapter({
				apiKey: "key",
				secretKey: "secret",
				passphrase: "passphrase",
				accountId: "888777",
				maxPages: 10,
			}).findTransactions({
				address: "888777",
				assetCode: "USDT",
				sinceBlock: 0n,
			}),
		).rejects.toThrow("OKX returned HTTP 200");
		expect(billRequests).toBe(3);
		expect(
			fetchMock.mock.calls.filter(([url]) =>
				String(url).includes("/api/v5/public/time"),
			),
		).toHaveLength(1);
		expect(fetchMock).toHaveBeenCalledTimes(4);
	});

	it("bounds configured assets and redacts unexpected health failures", async () => {
		const assets = Object.fromEntries(
			Array.from({ length: 33 }, (_, index) => [`ASSET${index}`, 8]),
		);
		expect(
			() =>
				new OkxPayAdapter({
					apiKey: "key",
					secretKey: "secret",
					passphrase: "passphrase",
					accountId: "888777",
					assetDecimals: assets,
				}),
		).toThrow("Too many OKX assets");

		globalThis.fetch = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new TypeError("provider-secret-and-url"));
		const health = await new OkxPayAdapter({
			apiKey: "key",
			secretKey: "secret",
			passphrase: "passphrase",
			accountId: "888777",
		}).healthCheck();
		expect(health).toMatchObject({
			healthy: false,
			detail: "OKX health check failed: network",
		});
		expect(health.detail).not.toContain("provider-secret-and-url");
	});
});

function binanceHistoryResponse(count: number) {
	return Response.json({
		code: "000000",
		success: true,
		data: Array.from({ length: count }, (_, index) => ({
			fundsDetail: [{ amount: "1", currency: "USDT" }],
			receiverInfo: { binanceId: "123456" },
			transactionId: `pay-${index}`,
			transactionTime: index + 1,
		})),
	});
}

function okxBillsResponse(count: number) {
	return Response.json({
		code: "0",
		data: Array.from({ length: count }, (_, index) => ({
			balChg: "1",
			billId: `bill-${index}`,
			ccy: "USDT",
			ts: String(index + 1),
			type: "72",
		})),
	});
}
