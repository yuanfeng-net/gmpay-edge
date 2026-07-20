"use client";

import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { ProButton } from "#/components/pro/base/button";
import { ProTable, type ProTableState } from "#/components/pro/table";
import { Badge } from "#/components/ui/badge";
import { listInboundWebhookReceiptsFn } from "#/features/webhooks/server/admin";
import { PageHeader } from "#/layouts/components/page-header";
import { formatDateTime } from "#/lib/format";
import { useCurrentProTableUrlState } from "#/lib/pro-table-url-state";
import { m } from "#/paraglide/messages";

type InboundNotificationRecord = Awaited<
	ReturnType<typeof listInboundWebhookReceiptsFn>
>["items"][number];

export function InboundNotificationRecordsPage() {
	const tableUrlState = useCurrentProTableUrlState({
		searchColumnId: "requestId",
	});
	const [refreshKey, setRefreshKey] = useState(0);
	const request = useCallback(async (state: ProTableState) => {
		const search = String(
			state.columnFilters.find((filter) => filter.id === "requestId")?.value ??
				"",
		);
		const result = await listInboundWebhookReceiptsFn({
			data: {
				pageIndex: state.pagination.pageIndex,
				pageSize: state.pagination.pageSize,
				search,
			},
		});
		return { data: result.items, total: result.total };
	}, []);
	const columns = useMemo<ColumnDef<InboundNotificationRecord>[]>(
		() => [
			{
				accessorKey: "endpointCode",
				header: m.webhooks_inbound_endpoint(),
				cell: ({ row }) => (
					<div>
						<strong className="block">
							{endpointNameLabel(row.original.endpointCode)}
						</strong>
						<code className="text-muted-foreground text-xs">
							{row.original.requestPath}
						</code>
					</div>
				),
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
				accessorKey: "processingStatus",
				header: m.common_status(),
				cell: ({ row }) => (
					<div className="space-y-1">
						<Badge
							variant={
								row.original.processingStatus === "failed"
									? "destructive"
									: "secondary"
							}
						>
							{processingStatusLabel(row.original.processingStatus)}
						</Badge>
						<small className="block text-muted-foreground">
							{m.webhooks_signature()}:{" "}
							{signatureStatusLabel(row.original.signatureStatus)}
						</small>
					</div>
				),
			},
			{
				accessorKey: "responseStatus",
				header: m.webhooks_response(),
				cell: ({ row }) => (
					<div>
						<span>{row.original.responseStatus}</span>
						<small className="block text-muted-foreground">
							{row.original.durationMs} ms
							{row.original.errorCode ? ` · ${row.original.errorCode}` : ""}
						</small>
					</div>
				),
			},
			{
				accessorKey: "receivedAt",
				header: m.webhooks_received_at(),
				cell: ({ row }) => formatDateTime(row.original.receivedAt),
			},
			{
				id: "actions",
				header: m.common_actions(),
				cell: ({ row }) =>
					row.original.endpointId ? (
						<div className="flex justify-end">
							<ProButton variant="ghost" size="sm" asChild>
								<Link
									to="/admin/webhooks/$endpointId"
									params={{ endpointId: row.original.endpointId }}
								>
									{m.webhooks_view_details()}
								</Link>
							</ProButton>
						</div>
					) : null,
			},
		],
		[],
	);
	return (
		<div className="flex min-h-0 w-full flex-1 flex-col gap-4">
			<PageHeader
				title={m.webhooks_inbound_records_title()}
				description={m.webhooks_inbound_records_description()}
			/>
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
