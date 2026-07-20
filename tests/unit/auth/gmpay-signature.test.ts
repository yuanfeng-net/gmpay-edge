import { describe, expect, it } from "vitest";
import {
	gmpaySignaturePayload,
	signGmpayParameters,
	verifyGmpaySignature,
} from "#/features/api-keys/server/gmpay-signature";

describe("GMPay MD5 parameter signatures", () => {
	it("matches the EPUSDT GMPay sorted non-empty parameter algorithm", () => {
		const parameters = {
			pid: "gmp_merchant",
			order_id: "ORDER-1001",
			currency: "cny",
			token: "usdt",
			network: "tron",
			amount: 100,
			notify_url: "https://merchant.example/notify",
			redirect_url: "",
			name: null,
			signature: "must-not-participate",
		};
		expect(gmpaySignaturePayload(parameters, "merchant-secret")).toBe(
			"amount=100&currency=cny&network=tron&notify_url=https://merchant.example/notify&order_id=ORDER-1001&pid=gmp_merchant&token=usdtmerchant-secret",
		);
		expect(signGmpayParameters(parameters, "merchant-secret")).toBe(
			"dd499d9fc6edf8a719f64c4f34cbd0d2",
		);
	});

	it("verifies exact lowercase signatures and includes optional fields", () => {
		const parameters = {
			pid: "gmp_merchant",
			order_id: "ORDER-1002",
			amount: "12.50",
			payment_type: "Gmpay",
		};
		const signature = signGmpayParameters(parameters, "merchant-secret");
		expect(
			verifyGmpaySignature(
				{ ...parameters, signature },
				"merchant-secret",
				signature,
			),
		).toBe(true);
		expect(
			verifyGmpaySignature(
				{ ...parameters, payment_type: "Epay", signature },
				"merchant-secret",
				signature,
			),
		).toBe(false);
	});
});
