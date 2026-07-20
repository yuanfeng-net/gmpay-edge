"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { ProButton } from "#/components/pro/base/button";
import { ProTable, type ProTableState } from "#/components/pro/table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
	deleteTelegramBindingFn,
	listTelegramBindingsFn,
	type TelegramBindingRecord,
} from "#/features/telegram/server/users-admin";
import { PageHeader } from "#/layouts/components/page-header";
import { formatDateTime } from "#/lib/format";
import { useCurrentProTableUrlState } from "#/lib/pro-table-url-state";
import { m } from "#/paraglide/messages";
import { showTelegramError } from "./form-fields";

export function TelegramUsersPage() {
	const tableUrlState = useCurrentProTableUrlState({
		searchColumnId: "telegramUserId",
	});
	const client = useQueryClient();
	const [refreshKey, setRefreshKey] = useState(0);
	const snapshotRef = useRef<{ key: string; at: number } | null>(null);
	const refresh = useCallback(async () => {
		snapshotRef.current = null;
		await client.invalidateQueries({
			queryKey: ["admin", "telegram", "users"],
		});
		setRefreshKey((value) => value + 1);
	}, [client]);
	const request = useCallback(
		async (state: ProTableState) => {
			const search = String(
				state.columnFilters.find((filter) => filter.id === "telegramUserId")
					?.value ?? "",
			);
			const key = `${search}:${state.pagination.pageSize}`;
			if (snapshotRef.current?.key !== key)
				snapshotRef.current = { key, at: Date.now() };
			const input = {
				pageIndex: state.pagination.pageIndex,
				pageSize: state.pagination.pageSize,
				search,
				beforeCreatedAt: snapshotRef.current.at,
			};
			return client.fetchQuery({
				queryKey: ["admin", "telegram", "users", input],
				queryFn: () => listTelegramBindingsFn({ data: input }),
			});
		},
		[client],
	);
	const remove = useMutation({
		mutationFn: deleteTelegramBindingFn,
		onSuccess: refresh,
		onError: showTelegramError,
	});
	const columns = useMemo<ColumnDef<TelegramBindingRecord>[]>(
		() => [
			{ accessorKey: "botName", header: m.telegram_bot() },
			{ accessorKey: "templateName", header: m.telegram_templates() },
			{
				accessorKey: "telegramUserId",
				header: m.telegram_user_id(),
				cell: ({ row }) => (
					<code className="text-xs">{row.original.telegramUserId}</code>
				),
			},
			{
				accessorKey: "createdAt",
				header: m.common_created(),
				cell: ({ row }) => formatDateTime(row.original.createdAt),
			},
			{
				id: "actions",
				header: m.common_actions(),
				cell: ({ row }) => (
					<div className="flex justify-end">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<ProButton variant="ghost" tooltip={m.common_actions()}>
									<MoreHorizontal />
								</ProButton>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem
									variant="destructive"
									disabled={remove.isPending}
									onClick={() =>
										remove.mutate({ data: { id: row.original.id } })
									}
								>
									<Trash2 />
									{m.common_delete()}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				),
			},
		],
		[remove],
	);
	return (
		<div className="flex min-h-0 w-full flex-1 flex-col gap-4">
			<PageHeader
				title={m.nav_telegram_bindings()}
				description={m.telegram_bindings_description()}
			/>
			<ProTable
				initialState={tableUrlState.initialState}
				onChange={tableUrlState.onChange}
				className="min-h-0 flex-1"
				columns={columns}
				request={request}
				requestKey={refreshKey}
				onRefresh={refresh}
				toolbarSearch={{
					columnId: "telegramUserId",
					placeholder: m.telegram_search_bindings(),
				}}
				table={{ stickyHeader: true }}
			/>
		</div>
	);
}
