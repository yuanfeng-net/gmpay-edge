export const orderIdPattern = /^\d{20}$/;

export function generateOrderId(now = Date.now()) {
	const date = new Date(now);
	const timestamp = [
		String(date.getUTCFullYear()).slice(-2),
		String(date.getUTCMonth() + 1).padStart(2, "0"),
		String(date.getUTCDate()).padStart(2, "0"),
		String(date.getUTCHours()).padStart(2, "0"),
		String(date.getUTCMinutes()).padStart(2, "0"),
		String(date.getUTCSeconds()).padStart(2, "0"),
	].join("");
	const bytes = crypto.getRandomValues(new Uint8Array(8));
	const random = Array.from(bytes, (byte) => String(byte % 10)).join("");
	return `${timestamp}${random}`;
}

export function isOrderId(value: string) {
	return orderIdPattern.test(value);
}
