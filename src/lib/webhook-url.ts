const blockedHostnames = new Set([
	"0.0.0.0",
	"localhost",
	"localhost.localdomain",
	"metadata.google.internal",
	"169.254.169.254",
	"[::]",
	"[::1]",
]);

export function isSafeWebhookUrl(value: string) {
	try {
		const url = new URL(value);
		if (url.protocol !== "https:" || url.username || url.password) return false;
		const hostname = url.hostname.toLowerCase();
		if (
			blockedHostnames.has(hostname) ||
			hostname.endsWith(".local") ||
			hostname.endsWith(".internal") ||
			hostname.endsWith(".localhost")
		)
			return false;
		return !isPrivateIpv4(hostname) && !isPrivateIpv6(hostname);
	} catch {
		return false;
	}
}

function isPrivateIpv4(hostname: string) {
	const parts = hostname.split(".");
	if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part)))
		return false;
	const octets = parts.map(Number);
	if (octets.some((octet) => octet > 255)) return true;
	return isPrivateIpv4Octets(octets);
}

function isPrivateIpv4Octets(octets: number[]) {
	const [a, b] = octets;
	if (a === undefined || b === undefined) return true;
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && (b === 0 || b === 168)) ||
		a >= 224
	);
}

function isPrivateIpv6(hostname: string) {
	const address = parseIpv6(hostname.replace(/^\[|\]$/g, "").toLowerCase());
	if (address === null) return false;
	const upper96 = address >> 32n;
	if (upper96 === 0n || upper96 === 0xffffn) {
		const ipv4 = Number(address & 0xffff_ffffn);
		return isPrivateIpv4Octets([
			(ipv4 >>> 24) & 255,
			(ipv4 >>> 16) & 255,
			(ipv4 >>> 8) & 255,
			ipv4 & 255,
		]);
	}
	return (
		address === 0n ||
		address === 1n ||
		address >> 121n === 0x7en ||
		address >> 118n === 0x3fan ||
		address >> 120n === 0xffn
	);
}

function parseIpv6(value: string) {
	if (!value.includes(":")) return null;
	const halves = value.split("::");
	if (halves.length > 2) return null;
	const left = halves[0]?.split(":").filter(Boolean) ?? [];
	const right = halves[1]?.split(":").filter(Boolean) ?? [];
	const missing = 8 - left.length - right.length;
	if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
	const groups = [
		...left,
		...Array.from({ length: missing }, () => "0"),
		...right,
	];
	if (
		groups.length !== 8 ||
		groups.some((part) => !/^[\da-f]{1,4}$/.test(part))
	)
		return null;
	return groups.reduce(
		(result, part) => (result << 16n) | BigInt(`0x${part}`),
		0n,
	);
}
