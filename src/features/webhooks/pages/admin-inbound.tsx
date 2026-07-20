"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Activity, Copy, ExternalLink } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { ProButton } from "#/components/pro/base/button";
import { ProTable, type ProTableState } from "#/components/pro/table";
import { Badge } from "#/components/ui/badge";
import { webhookOperationErrorMessage } from "#/features/webhooks/error-message";
import {
	getInboundWebhookEndpointPageFn,
	listInboundWebhookEndpointsFn,
} from "#/features/webhooks/server/admin";
import { PageHeader } from "#/layouts/components/page-header";
import { formatDateTime } from "#/lib/format";
import { useCurrentProTableUrlState } from "#/lib/pro-table-url-state";
import { m } from "#/paraglide/messages";

type Endpoint = Awaited<
	ReturnType<typeof listInboundWebhookEndpointsFn>
>[number];
type Receipt = Awaited<
	ReturnType<typeof getInboundWebhookEndpointPageFn>
>["receipts"][number];
type EndpointMetadata = Awaited<
	ReturnType<typeof getInboundWebhookEndpointPageFn>
>["endpoint"];
export function InboundWebhookEndpointsPage() {
	const tableUrlState = useCurrentProTableUrlState({ searchColumnId: "name" });
	const query = useQuery({
		queryKey: ["admin", "inbound-webhooks"],
		queryFn: () => listInboundWebhookEndpointsFn(),
	});
	const columns = useMemo<ColumnDef<Endpoint>[]>(
		() => [
			{
				accessorKey: "name",
				header: m.webhooks_inbound_endpoint(),
				meta: { search: true },
				cell: ({ row }) => (
					<div>
						<Link
							className="font-medium hover:underline"
							to="/admin/webhooks/$endpointId"
							params={{ endpointId: row.original.id }}
						>
							{endpointNameLabel(row.original.code)}
						</Link>
						<code className="block text-muted-foreground text-xs">
							{row.original.code}
						</code>
					</div>
				),
			},
			{
				accessorKey: "path",
				header: m.webhooks_path(),
				cell: ({ row }) => <code className="text-xs">{row.original.path}</code>,
			},
			{
				accessorKey: "kind",
				header: m.common_type(),
				cell: ({ row }) => (
					<Badge variant="outline">{inboundKindLabel(row.original.kind)}</Badge>
				),
			},
			{
				accessorKey: "receiptCount",
				header: m.webhooks_receipts(),
			},
			{
				accessorKey: "lastReceivedAt",
				header: m.webhooks_last_received(),
				cell: ({ row }) =>
					row.original.lastReceivedAt
						? formatDateTime(row.original.lastReceivedAt)
						: "—",
			},
		],
		[],
	);
	return (
		<div className="flex min-h-0 w-full flex-1 flex-col gap-4">
			<PageHeader
				title={m.webhooks_inbound_title()}
				description={
					query.error
						? webhookOperationErrorMessage(query.error)
						: m.webhooks_inbound_description()
				}
			/>
			<ProTable
				initialState={tableUrlState.initialState}
				onChange={tableUrlState.onChange}
				className="min-h-0 flex-1"
				columns={columns}
				data={query.data ?? []}
				loading={query.isLoading}
				onRefresh={() => query.refetch()}
				toolbarSearch={{
					columnId: "name",
					placeholder: m.webhooks_search_inbound(),
				}}
				table={{ stickyHeader: true }}
			/>
		</div>
	);
}

export function InboundWebhookEndpointPage({
	endpointId,
}: {
	endpointId: string;
}) {
	const tableUrlState = useCurrentProTableUrlState({
		searchColumnId: "requestId",
	});
	const [refreshKey, setRefreshKey] = useState(0);
	const [endpoint, setEndpoint] = useState<EndpointMetadata | null>(null);
	const [loadError, setLoadError] = useState<unknown>();
	const request = useCallback(
		async (state: ProTableState) => {
			const search = String(
				state.columnFilters.find((filter) => filter.id === "requestId")
					?.value ?? "",
			);
			try {
				const result = await getInboundWebhookEndpointPageFn({
					data: {
						id: endpointId,
						pageIndex: state.pagination.pageIndex,
						pageSize: state.pagination.pageSize,
						search,
					},
				});
				setEndpoint(result.endpoint);
				setLoadError(undefined);
				return { data: result.receipts, total: result.receiptTotal };
			} catch (error) {
				setLoadError(error);
				throw error;
			}
		},
		[endpointId],
	);
	const columns = useMemo<ColumnDef<Receipt>[]>(
		() => [
			{
				accessorKey: "receivedAt",
				header: m.webhooks_received_at(),
				cell: ({ row }) => formatDateTime(row.original.receivedAt),
			},
			{
				accessorKey: "requestId",
				header: m.webhooks_request_id(),
				meta: { search: true },
				cell: ({ row }) => (
					<code className="block max-w-56 truncate text-xs">
						{row.original.requestId}
					</code>
				),
			},
			{
				accessorKey: "signatureStatus",
				header: m.webhooks_signature(),
				cell: ({ row }) => (
					<Badge
						variant={
							row.original.signatureStatus === "valid" ? "default" : "outline"
						}
					>
						{signatureStatusLabel(row.original.signatureStatus)}
					</Badge>
				),
			},
			{
				accessorKey: "processingStatus",
				header: m.common_status(),
				cell: ({ row }) => (
					<Badge
						variant={
							row.original.processingStatus === "failed"
								? "destructive"
								: "secondary"
						}
					>
						{processingStatusLabel(row.original.processingStatus)}
					</Badge>
				),
			},
			{ accessorKey: "responseStatus", header: m.webhooks_response() },
			{
				accessorKey: "durationMs",
				header: m.common_duration(),
				cell: ({ row }) => `${row.original.durationMs} ms`,
			},
			{ accessorKey: "errorCode", header: m.webhooks_error_code() },
		],
		[],
	);
	return (
		<div className="flex min-h-0 w-full flex-1 flex-col gap-4">
			<PageHeader
				title={
					endpoint
						? endpointNameLabel(endpoint.code)
						: m.webhooks_inbound_endpoint()
				}
				description={
					loadError
						? webhookOperationErrorMessage(loadError)
						: (endpoint?.path ?? m.webhooks_inbound_description())
				}
				actions={
					endpoint ? (
						<div className="flex flex-wrap gap-2">
							{endpoint.code === "alchemy.address_activity" ? (
								<ProButton variant="outline" asChild>
									<Link
										to="/admin/webhooks/provider-events"
										search={{ sourceId: undefined }}
									>
										<Activity />
										{m.webhooks_provider_events_title()}
									</Link>
								</ProButton>
							) : null}
							<ProButton
								variant="outline"
								onClick={async () => {
									await navigator.clipboard.writeText(endpoint.exampleUrl);
									toast.success(m.webhooks_url_copied());
								}}
							>
								<Copy />
								{m.webhooks_copy_url()}
							</ProButton>
						</div>
					) : undefined
				}
			/>
			{endpoint ? (
				<div className="flex items-center gap-2 rounded-lg border p-3">
					<ExternalLink className="size-4 text-muted-foreground" />
					<code className="min-w-0 flex-1 break-all text-xs">
						{endpoint.exampleUrl}
					</code>
				</div>
			) : null}
			<ProTable
				initialState={tableUrlState.initialState}
				onChange={tableUrlState.onChange}
				className="min-h-0 flex-1"
				columns={columns}
				request={request}
				requestKey={refreshKey}
				onRefresh={() => setRefreshKey((value) => value + 1)}
				toolbarSearch={{
					columnId: "requestId",
					placeholder: m.webhooks_search_receipts(),
				}}
				table={{ stickyHeader: true }}
			/>
		</div>
	);
}

function endpointNameLabel(code: string) {
	if (code === "okpay.notify") return m.webhooks_endpoint_okpay();
	if (code === "alchemy.address_activity") return m.webhooks_endpoint_alchemy();
	if (code === "telegram.update") return m.webhooks_endpoint_telegram();
	return m.common_unknown();
}

function inboundKindLabel(kind: string) {
	if (kind === "provider") return m.webhooks_kind_provider();
	if (kind === "telegram") return m.system_nav_telegram();
	return m.common_unknown();
}

function signatureStatusLabel(status: string) {
	if (status === "valid") return m.webhooks_signature_valid();
	if (status === "invalid") return m.webhooks_signature_invalid();
	if (status === "not_applicable") return m.webhooks_signature_not_applicable();
	return m.common_unknown();
}

function processingStatusLabel(status: string) {
	if (status === "succeeded") return m.status_succeeded();
	if (status === "rejected") return m.webhooks_processing_rejected();
	if (status === "failed") return m.status_failed();
	return m.common_unknown();
}
