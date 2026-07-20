"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ProButton } from "#/components/pro/base/button";
import { ModalForm } from "#/components/pro/form";
import { ProTable, type ProTableState } from "#/components/pro/table";
import { Badge } from "#/components/ui/badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Switch } from "#/components/ui/switch";
import {
	createTelegramTemplateFn,
	deleteTelegramTemplateFn,
	listTelegramTemplatesFn,
	setTelegramTemplateEnabledFn,
	type TelegramTemplateRecord,
	updateTelegramTemplateFn,
} from "#/features/telegram/server/templates-admin";
import { PageHeader } from "#/layouts/components/page-header";
import { supportedLocales } from "#/lib/locales";
import { useCurrentProTableUrlState } from "#/lib/pro-table-url-state";
import { m } from "#/paraglide/messages";
import {
	emptyTemplateTranslations,
	showTelegramError,
	templateFormSchema,
	templateTranslations,
} from "./form-fields";

export function TelegramTemplatesPage() {
	const tableUrlState = useCurrentProTableUrlState({ searchColumnId: "name" });
	const client = useQueryClient();
	const [refreshKey, setRefreshKey] = useState(0);
	const [editing, setEditing] = useState<TelegramTemplateRecord | null>(null);
	const snapshotRef = useRef<{ key: string; at: number } | null>(null);
	const refresh = useCallback(async () => {
		snapshotRef.current = null;
		await Promise.all(
			["templates", "notifications", "commands"].map((resource) =>
				client.invalidateQueries({
					queryKey: ["admin", "telegram", resource],
				}),
			),
		);
		setRefreshKey((value) => value + 1);
	}, [client]);
	const request = useCallback(
		async (state: ProTableState) => {
			const search = String(
				state.columnFilters.find((filter) => filter.id === "name")?.value ?? "",
			);
			const key = `${search}:${state.pagination.pageSize}`;
			if (snapshotRef.current?.key !== key) {
				snapshotRef.current = { key, at: Date.now() };
			}
			const input = {
				pageIndex: state.pagination.pageIndex,
				pageSize: state.pagination.pageSize,
				search,
				beforeCreatedAt: snapshotRef.current.at,
			};
			return client.fetchQuery({
				queryKey: ["admin", "telegram", "templates", input],
				queryFn: () => listTelegramTemplatesFn({ data: input }),
			});
		},
		[client],
	);
	const toggle = useMutation({
		mutationFn: setTelegramTemplateEnabledFn,
		onSuccess: refresh,
		onError: showTelegramError,
	});
	const remove = useMutation({
		mutationFn: deleteTelegramTemplateFn,
		onSuccess: refresh,
		onError: showTelegramError,
	});
	const update = useMutation({
		mutationFn: updateTelegramTemplateFn,
		onSuccess: async () => {
			setEditing(null);
			await refresh();
			toast.success(m.telegram_template_updated());
		},
		onError: showTelegramError,
	});
	const columns = useMemo<ColumnDef<TelegramTemplateRecord>[]>(
		() => [
			{
				accessorKey: "enabled",
				header: m.common_enabled(),
				cell: ({ row }) => (
					<Switch
						aria-label={`${m.common_enabled()} · ${row.original.name}`}
						checked={row.original.enabled}
						disabled={toggle.isPending}
						onCheckedChange={(enabled) =>
							toggle.mutate({ data: { id: row.original.id, enabled } })
						}
					/>
				),
			},
			{
				accessorKey: "name",
				header: m.common_name(),
				meta: { search: true },
			},
			{
				id: "locales",
				header: m.telegram_locale(),
				cell: () => (
					<div className="flex flex-wrap gap-1">
						{supportedLocales.map((locale) => (
							<Badge key={locale} variant="outline">
								{locale}
							</Badge>
						))}
					</div>
				),
			},
			{
				id: "content",
				header: m.telegram_template_content(),
				cell: ({ row }) => (
					<span
						className="block max-w-md truncate"
						title={row.original.translations["en-US"]}
					>
						{row.original.translations["en-US"]}
					</span>
				),
			},
			{
				id: "actions",
				header: m.common_actions(),
				cell: ({ row }) => (
					<div className="flex justify-end">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<ProButton
									size="icon-sm"
									variant="ghost"
									tooltip={m.common_actions()}
								>
									<MoreHorizontal />
								</ProButton>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onClick={() => setEditing(row.original)}>
									<Pencil />
									{m.common_edit()}
								</DropdownMenuItem>
								<DropdownMenuSeparator />
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
		[remove, toggle],
	);

	return (
		<div className="flex min-h-0 w-full flex-1 flex-col gap-4">
			<PageHeader
				title={m.telegram_templates()}
				description={m.telegram_templates_description()}
				actions={<CreateTemplate onCreated={refresh} />}
			/>
			<ProTable
				initialState={tableUrlState.initialState}
				onChange={tableUrlState.onChange}
				className="min-h-0 flex-1"
				columns={columns}
				request={request}
				requestKey={refreshKey}
				onRefresh={refresh}
				toolbarSearch={{ columnId: "name", placeholder: m.common_search() }}
				table={{ stickyHeader: true }}
			/>
			<ModalForm
				open={Boolean(editing)}
				onOpenChange={(open) => {
					if (!open) setEditing(null);
				}}
				title={m.common_edit()}
				description={m.telegram_templates_description()}
				schema={templateFormSchema()}
				initialValues={
					editing
						? {
								name: editing.name,
								translations: JSON.stringify(editing.translations),
							}
						: {}
				}
				onFinish={async (values) => {
					if (!editing) return;
					await update.mutateAsync({
						data: {
							id: editing.id,
							name: String(values.name ?? ""),
							translations: templateTranslations(values.translations),
						},
					});
				}}
				onFinishFailed={showTelegramError}
			/>
		</div>
	);
}

function CreateTemplate({ onCreated }: { onCreated: () => Promise<unknown> }) {
	return (
		<ModalForm
			title={m.common_new()}
			description={m.telegram_add_template_description()}
			trigger={<ProButton>{m.common_new()}</ProButton>}
			schema={templateFormSchema()}
			initialValues={{
				translations: JSON.stringify(emptyTemplateTranslations()),
			}}
			onFinish={async (values) => {
				await createTelegramTemplateFn({
					data: {
						name: String(values.name ?? ""),
						translations: templateTranslations(values.translations),
					},
				});
				await onCreated();
				toast.success(m.telegram_template_added());
			}}
			onFinishFailed={showTelegramError}
		/>
	);
}
