import { describe, expect, it } from "vitest";
import { generateOrderId, isOrderId } from "#/features/orders/order-id";

describe("order IDs", () => {
	it("generates compact numeric IDs with a readable UTC timestamp", () => {
		const first = generateOrderId(Date.UTC(2026, 6, 13, 6, 23, 45));
		expect(first).toMatch(/^\d{20}$/);
		expect(first.startsWith("260713062345")).toBe(true);
		expect(isOrderId(first)).toBe(true);
	});

	it("rejects UUID and malformed public IDs", () => {
		expect(isOrderId("11111111-1111-4111-8111-111111111111")).toBe(false);
		expect(isOrderId("gm_123456789012345678")).toBe(false);
	});
});
