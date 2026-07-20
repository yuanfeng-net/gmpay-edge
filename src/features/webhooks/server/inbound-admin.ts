import { z } from "zod";
import { inboundWebhookEndpoints } from "#/features/webhooks/server/inbound-receipts";
import { DomainError } from "#/lib/domain-error";

export const inboundReceiptQuerySchema = z.object({
	id: z.string().min(1).max(100),
	pageIndex: z.number().int().min(0).default(0),
	pageSize: z.number().int().min(1).max(100).default(10),
	search: z.string().trim().max(200).default(""),
});

export async function loadInboundWebhookEndpointPage(
	db: D1Database,
	origin: string,
	input: z.infer<typeof inboundReceiptQuerySchema>,
) {
	const search = input.search ? `%${input.search}%` : null;
	const receiptWhere = search ? "AND request_id LIKE ?" : "";
	const endpoint = inboundWebhookEndpoints.find(
		(entry) => entry.id === input.id,
	);
	if (!endpoint) throwInboundEndpointNotFound();
	const [receiptCountResult, receiptsResult] = await db.batch([
		db
			.prepare(
				`SELECT COUNT(*) AS total FROM inbound_webhook_receipts
				 WHERE endpoint_code = ? ${receiptWhere}`,
			)
			.bind(endpoint.code, ...(search ? [search] : [])),
		db
			.prepare(`SELECT id, request_id, method, request_path, signature_status,
		processing_status, response_status, duration_ms, error_code, received_at
		FROM inbound_webhook_receipts WHERE endpoint_code = ? ${receiptWhere}
		ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?`)
			.bind(
				endpoint.code,
				...(search ? [search] : []),
				input.pageSize,
				input.pageIndex * input.pageSize,
			),
	]);
	const receiptCount = receiptCountResult?.results?.[0] as
		| { total: number }
		| undefined;
	const receipts = receiptsResult as D1Result<{
		id: string;
		request_id: string;
		method: string;
		request_path: string;
		signature_status: string;
		processing_status: string;
		response_status: number;
		duration_ms: number;
		error_code: string | null;
		received_at: number;
	}>;
	return {
		endpoint: {
			...endpoint,
			exampleUrl: `${origin}${endpoint.path
				.replace(":botId", "{botId}")
				.replace(":sourceId", "{sourceId}")}`,
		},
		receipts: receipts.results.map((row) => ({
			id: row.id,
			requestId: row.request_id,
			method: row.method,
			requestPath: row.request_path,
			signatureStatus: row.signature_status,
			processingStatus: row.processing_status,
			responseStatus: row.response_status,
			durationMs: row.duration_ms,
			errorCode: row.error_code,
			receivedAt: new Date(row.received_at).toISOString(),
		})),
		receiptTotal: receiptCount?.total ?? 0,
		pageIndex: input.pageIndex,
		pageSize: input.pageSize,
	};
}

function throwInboundEndpointNotFound(): never {
	throw new DomainError(
		"webhook_inbound_endpoint_not_found",
		404,
		"Inbound webhook endpoint not found",
	);
}
