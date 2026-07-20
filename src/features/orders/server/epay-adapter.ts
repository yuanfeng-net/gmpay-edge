import { z } from "zod";
import {
	authenticateGmpayParameters,
	GmpayRateLimitError,
} from "#/features/api-keys/server/gmpay-signature";
import {
	type CreateOrderInput,
	createOrderSchema,
} from "#/features/orders/schema";
import {
	createOrder,
	type OrderCreationContext,
	OrderServiceError,
} from "#/features/orders/server/create";
import {
	gmpayCreateResponse,
	gmpayError,
	gmpayOrderError,
	gmpayOrderMessage,
	logMerchantApiFailure,
} from "#/features/orders/server/gmpay-api";
import type { ApiOrder } from "#/features/orders/server/query";
import { requestId as getRequestId } from "#/server/http";

const epayPaymentType = /^(?:alipay|[a-z0-9_-]{2,20}\.[a-z0-9-]{2,32})$/;

const epayInputSchema = z.object({
	pid: z.union([z.string(), z.number()]).transform(String),
	money: z.union([z.string(), z.number()]).transform(String),
	out_trade_no: z.string().trim().min(1).max(128),
	notify_url: z.string().trim().url(),
	return_url: z.string().trim().url().optional(),
	name: z.string().trim().max(500).optional(),
	type: z.string().trim().toLowerCase().regex(epayPaymentType).optional(),
	sign: z
		.string()
		.trim()
		.regex(/^[0-9a-f]{32}$/),
	sign_type: z.string().trim().toUpperCase().optional(),
});

export type EpayInput = z.infer<typeof epayInputSchema>;

export async function readEpayParameters(request: Request) {
	const parameters = Object.fromEntries(new URL(request.url).searchParams);
	if (request.method === "POST") {
		const contentType =
			request.headers.get("content-type")?.toLowerCase() ?? "";
		if (!contentType.includes("application/x-www-form-urlencoded"))
			return undefined;
		for (const [key, value] of new URLSearchParams(await request.text()))
			parameters[key] = value;
	}
	return parameters;
}

export function parseEpayInput(value: unknown) {
	return epayInputSchema.safeParse(value);
}

export async function authenticateEpayInput(db: D1Database, input: EpayInput) {
	return authenticateGmpayParameters(db, input, "orders:create", {
		signatureField: "sign",
		excluded: new Set(["sign", "sign_type"]),
	});
}

export function toEpayOrderInput(input: EpayInput): CreateOrderInput {
	const selection = epaySelection(input.type);
	return createOrderSchema.parse({
		externalOrderId: input.out_trade_no,
		amount: input.money,
		currency: "CNY",
		paymentAsset: selection?.asset,
		paymentNetwork: selection?.network,
		description: input.name || undefined,
		returnUrl: input.return_url || undefined,
		notifyUrl: input.notify_url,
		metadata: {
			integration: "epay",
			epayType: input.type || "alipay",
		},
	});
}

export function epaySelection(value: string | undefined) {
	if (!value || value === "alipay") return null;
	const match = value.match(/^([a-z0-9_-]{2,20})\.([a-z0-9-]{2,32})$/);
	if (!match) throw new Error("Unsupported EPay payment type");
	const [, asset, network] = match;
	if (!(asset && network)) throw new Error("Unsupported EPay payment type");
	return { asset: asset.toUpperCase(), network: network.toLowerCase() };
}

type OrderCreator = (
	db: D1Database,
	input: CreateOrderInput,
	requestUrl: string,
	context: OrderCreationContext,
) => Promise<ApiOrder>;

export async function handleEpayCreateRequest(
	request: Request,
	env: Pick<Env, "DB">,
	create: OrderCreator = createOrder,
) {
	const requestId = getRequestId(request);
	try {
		const parsed = parseEpayInput(await readEpayParameters(request));
		if (!parsed.success)
			return epayResponse(
				gmpayError(requestId, 10009, "invalid parameters"),
				400,
			);
		const principal = await authenticateEpayInput(env.DB, parsed.data);
		if (!principal)
			return epayResponse(
				gmpayError(requestId, 401, "signature verification failed"),
				401,
			);
		const order = await create(
			env.DB,
			toEpayOrderInput(parsed.data),
			request.url,
			{
				apiKeyId: principal.apiKeyId,
				apiProtocol: "epay",
			},
		);
		return epayResponse(gmpayCreateResponse(order, requestId), 200);
	} catch (error) {
		if (error instanceof GmpayRateLimitError)
			return epayResponse(
				gmpayError(requestId, 429, "API rate limit exceeded"),
				429,
			);
		if (error instanceof OrderServiceError)
			return epayResponse(
				gmpayError(requestId, gmpayOrderError(error), gmpayOrderMessage(error)),
				error.status >= 500 ? error.status : 400,
			);
		logMerchantApiFailure("epay.create", requestId);
		return epayResponse(gmpayError(requestId, 500, "system error"), 500);
	}
}

function epayResponse(body: { request_id: string }, status: number) {
	return Response.json(body, {
		status,
		headers: {
			"cache-control": "no-store",
			"x-request-id": body.request_id,
		},
	});
}
