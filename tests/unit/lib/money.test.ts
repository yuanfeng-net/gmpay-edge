import { describe, expect, it } from "vitest";
import {
	convertByRate,
	decimalToUnits,
	divideByRate,
	unitsToDecimal,
} from "#/lib/money";

describe("money", () => {
	it("converts decimal strings without floating point", () => {
		expect(decimalToUnits("12.345678", 6)).toBe(12_345_678n);
		expect(unitsToDecimal(12_345_600n, 6)).toBe("12.3456");
	});
	it("rejects precision loss by default", () =>
		expect(() => decimalToUnits("1.0000001", 6)).toThrow(/precision/));
	it("rounds a quoted payment amount up", () =>
		expect(convertByRate("10.00", 2, "0.333333", 6, 6)).toBe("3.33333"));
	it("divides by a base-to-quote rate and rounds payment up", () =>
		expect(divideByRate("100.00", 2, "3.000000", 6, 6)).toBe("33.333334"));
});
