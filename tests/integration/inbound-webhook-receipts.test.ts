import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadInboundWebhookEndpointPage } from "#/features/webhooks/server/inbound-admin";
import {
	inboundWebhookCatalogEndpoints,
	inboundWebhookEndpoints,
	recordInboundWebhookReceipt,
} from "#/features/webhooks/server/inbound-receipts";
import { applyMigrations } from "./migrations";

describe("inbound webhook receipts", () => {
	let miniflare: Miniflare;
	let db: D1Database;

	beforeAll(async () => {
		miniflare = new Miniflare({
			modules: true,
			script: "export default { fetch() { return new Response('ok') } }",
			d1Databases: { DB: "gmpay-edge-inbound-webhooks-test" },
		});
		db = await miniflare.getD1Database("DB");
		await applyMigrations(db);
	});

	afterAll(async () => miniflare.dispose());

	it("keeps every supported inbound endpoint visible", () => {
		expect(
			inboundWebhookCatalogEndpoints.map((endpoint) => endpoint.code),
		).toEqual(["okpay.notify", "alchemy.address_activity", "telegram.update"]);
		expect(inboundWebhookEndpoints.map((endpoint) => endpoint.code)).toContain(
			"alchemy.address_activity",
		);
	});

	it("records only metadata and deduplicates a request ID", async () => {
		const request = new Request(
			"https://edge.example/api/providers/okpay/notify?secret=not-stored",
			{
				method: "POST",
				headers: { "x-request-id": "request-a" },
			},
		);
		await recordInboundWebhookReceipt(db, {
			endpointCode: "okpay.notify",
			request,
			startedAt: Date.now() - 7,
			responseStatus: 401,
			signatureStatus: "invalid",
			errorCode: "invalid_signature",
		});
		await recordInboundWebhookReceipt(db, {
			endpointCode: "okpay.notify",
			request,
			startedAt: Date.now(),
			responseStatus: 401,
			signatureStatus: "invalid",
		});
		const rows = await db
			.prepare(
				`SELECT request_id, request_path, signature_status, processing_status,
				 response_status, error_code FROM inbound_webhook_receipts`,
			)
			.all<Record<string, unknown>>();
		expect(rows.results).toEqual([
			{
				request_id: "request-a",
				request_path: "/api/providers/okpay/notify",
				signature_status: "invalid",
				processing_status: "rejected",
				response_status: 401,
				error_code: "invalid_signature",
			},
		]);
		expect(JSON.stringify(rows.results)).not.toContain("not-stored");
		const page = await loadInboundWebhookEndpointPage(
			db,
			"https://edge.example",
			{
				id: "inbound-okpay-notify",
				pageIndex: 0,
				pageSize: 1,
				search: "request-a",
			},
		);
		expect(page.endpoint).toMatchObject({
			code: "okpay.notify",
			path: "/api/providers/okpay/notify",
			exampleUrl: "https://edge.example/api/providers/okpay/notify",
		});
		expect(page).toMatchObject({
			receiptTotal: 1,
			pageIndex: 0,
			pageSize: 1,
		});
		expect(page.receipts).toHaveLength(1);
		expect(page.receipts[0]).toMatchObject({
			requestId: "request-a",
			requestPath: "/api/providers/okpay/notify",
			signatureStatus: "invalid",
			processingStatus: "rejected",
		});
	});

	it("returns a stable error for a missing built-in endpoint", async () => {
		await expect(
			loadInboundWebhookEndpointPage(db, "https://edge.example", {
				id: "missing-endpoint",
				pageIndex: 0,
				pageSize: 10,
				search: "",
			}),
		).rejects.toMatchObject({
			code: "webhook_inbound_endpoint_not_found",
			status: 404,
		});
	});
});
