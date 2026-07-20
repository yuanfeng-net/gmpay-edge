import { describe, expect, it } from "vitest";
import { signGmpayParameters } from "#/features/api-keys/server/gmpay-signature";
import {
	epaySelection,
	parseEpayInput,
	toEpayOrderInput,
} from "#/features/orders/server/epay-adapter";

describe("EPay compatibility adapter", () => {
	it("maps a token.network type into the shared order input", () => {
		const parameters = {
			pid: "100000000001",
			money: "12.50",
			out_trade_no: "EPAY-1001",
			notify_url: "https://merchant.example/notify",
			return_url: "https://merchant.example/return",
			name: "Invoice 1001",
			type: "usdt.tron",
		};
		const sign = signGmpayParameters(
			parameters,
			"merchant-secret",
			new Set(["sign", "sign_type"]),
		);
		const parsed = parseEpayInput({ ...parameters, sign, sign_type: "MD5" });
		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(toEpayOrderInput(parsed.data)).toMatchObject({
			externalOrderId: "EPAY-1001",
			amount: "12.50",
			currency: "CNY",
			paymentAsset: "USDT",
			paymentNetwork: "tron",
			metadata: { integration: "epay", epayType: "usdt.tron" },
		});
	});

	it("creates a selectable order for alipay without defaulting to TRON", () => {
		expect(epaySelection("alipay")).toBeNull();
		expect(epaySelection(undefined)).toBeNull();
		expect(
			parseEpayInput({
				pid: "merchant",
				money: "1.00",
				out_trade_no: "order",
				notify_url: "https://merchant.example/notify",
				type: "unsupported",
				sign: "a".repeat(32),
			}),
		).toMatchObject({ success: false });
		expect(() => epaySelection("unsupported")).toThrow(
			"Unsupported EPay payment type",
		);
	});
});
