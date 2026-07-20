import type { OrderStatus } from "#/features/orders/schema";
import { assertTransition } from "#/features/orders/state-machine";

export type CancellableOrder = {
	status: OrderStatus;
	version: number;
};

export type CancellationAudit = {
	action: "order.cancelled_by_api";
	apiKeyId: string;
	requestId: string | null;
	ipAddress: string | null;
};

export async function cancelOrderAtomically(
	db: D1Database,
	orderId: string,
	order: CancellableOrder,
	now = Date.now(),
	audit?: CancellationAudit,
) {
	assertTransition(order.status, "cancelled", "merchant_cancelled");
	const results = await db.batch([
		db
			.prepare(
				"UPDATE orders SET status = 'cancelled', version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND status = ?",
			)
			.bind(now, orderId, order.version, order.status),
		db
			.prepare(
				`UPDATE receiving_method_locks SET released_at = ?
				 WHERE order_id = ? AND released_at IS NULL
				 AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'cancelled' AND version = ?)`,
			)
			.bind(now, orderId, orderId, order.version + 1),
		...(audit
			? [
					db
						.prepare(
							`INSERT INTO audit_logs
							 (id, action, target_type, target_id, request_id, ip_address, before, after, created_at)
							 SELECT ?, ?, 'order', ?, ?, ?, ?, ?, ?
							 WHERE EXISTS (
								 SELECT 1 FROM orders
								 WHERE id = ? AND status = 'cancelled' AND version = ?
							 )`,
						)
						.bind(
							crypto.randomUUID(),
							audit.action,
							orderId,
							audit.requestId,
							audit.ipAddress,
							JSON.stringify({ status: order.status }),
							JSON.stringify({
								status: "cancelled",
								apiKeyId: audit.apiKeyId,
							}),
							now,
							orderId,
							order.version + 1,
						),
				]
			: []),
	]);
	return (results[0]?.meta.changes ?? 0) === 1;
}
