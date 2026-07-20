"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Settings2, Trash2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ProButton } from "#/components/pro/base/button";
import { formBooleanValue, ModalForm } from "#/components/pro/form";
import { ProTable, type ProTableState } from "#/components/pro/table";
import { Badge } from "#/components/ui/badge";
import { Switch } from "#/components/ui/switch";
import {
	createTelegramNotificationBindingFn,
	deleteTelegramNotificationBindingFn,
	listTelegramNotificationsFn,
	setTelegramNotificationEnabledFn,
	type TelegramNotificationBindingRecord,
	updateTelegramDefaultsFn,
} from "#/features/telegram/server/notifications-admin";
import type { TelegramTemplateRecord } from "#/features/telegram/server/template-catalog";
import { WebhookEventMatrix } from "#/features/webhooks/components/event-matrix";
import { webhookEventLabel } from "#/features/webhooks/event-label";
import { PageHeader } from "#/layouts/components/page-header";
import {
	localeLabels,
	type SupportedLocale,
	supportedLocales,
} from "#/lib/locales";
import { useCurrentProTableUrlState } from "#/lib/pro-table-url-state";
import { m } from "#/paraglide/messages";
import {
	eventValues,
	isWebhookEventType,
	showTelegramError,
	telegramOptionLabel,
} from "./form-fields";

type NotificationConfiguration = {
	bots: { id: string; name: string }[];
	templates: TelegramTemplateRecord[];
	defaults: {
		autoSubscribe: boolean;
		events: string[];
		templateId: string;
	};
};

const emptyConfiguration: NotificationConfiguration = {
	bots: [],
	templates: [],
	defaults: {
		autoSubscribe: false,
		events: ["order.paid", "order.expired"],
		templateId: "",
	},
};

export function TelegramNotificationsPage() {
	const tableUrlState = useCurrentProTableUrlState({ searchColumnId: "name" });
	const client = useQueryClient();
	const [refreshKey, setRefreshKey] = useState(0);
	const [configuration, setConfiguration] =
		useState<NotificationConfiguration>(emptyConfiguration);
	const snapshotRef = useRef<{ key: string; at: number } | null>(null);
	const refresh = useCallback(async () => {
		snapshotRef.current = null;
		await client.invalidateQueries({
			queryKey: ["admin", "telegram", "notifications"],
		});
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
			const result = await client.fetchQuery({
				queryKey: ["admin", "telegram", "notifications", input],
				queryFn: () => listTelegramNotificationsFn({ data: input }),
			});
			setConfiguration({
				bots: result.bots,
				templates: result.templates,
				defaults: result.defaults,
			});
			return { data: result.data, total: result.total };
		},
		[client],
	);
	const remove = useMutation({
		mutationFn: deleteTelegramNotificationBindingFn,
		onSuccess: refresh,
		onError: showTelegramError,
	});
	const toggle = useMutation({
		mutationFn: setTelegramNotificationEnabledFn,
		onSuccess: refresh,
		onError: showTelegramError,
	});
	const columns = useMemo<ColumnDef<TelegramNotificationBindingRecord>[]>(
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
			{ accessorKey: "botName", header: m.telegram_bot() },
			{ accessorKey: "locale", header: m.telegram_locale() },
			{
				accessorKey: "targetId",
				header: m.telegram_target_id(),
				cell: ({ row }) => (
					<div>
						<Badge variant="outline">
							{telegramOptionLabel(row.original.targetType)}
						</Badge>
						<code className="ml-2 text-xs">{row.original.targetId}</code>
					</div>
				),
			},
			{
				accessorKey: "events",
				header: m.telegram_events(),
				cell: ({ row }) => (
					<div className="flex max-w-md flex-wrap gap-1">
						{row.original.events.map((event) => (
							<Badge key={event} variant="secondary">
								{webhookEventLabel(event)}
							</Badge>
						))}
					</div>
				),
			},
			{
				id: "actions",
				header: m.common_actions(),
				cell: ({ row }) => (
					<ProButton
						size="icon-sm"
						variant="ghost"
						tooltip={m.common_delete()}
						disabled={remove.isPending}
						onClick={() => remove.mutate({ data: { id: row.original.id } })}
					>
						<Trash2 />
					</ProButton>
				),
			},
		],
		[remove, toggle],
	);

	return (
		<div className="flex min-h-0 w-full flex-1 flex-col gap-4">
			<PageHeader
				title={m.nav_telegram_subscriptions()}
				description={m.telegram_notifications_description()}
				actions={
					<div className="flex gap-2">
						<DefaultSubscriptions
							configuration={configuration}
							onSaved={refresh}
						/>
						<CreateNotification
							configuration={configuration}
							onCreated={refresh}
						/>
					</div>
				}
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
					columnId: "name",
					placeholder: m.telegram_search_bindings(),
				}}
				table={{ stickyHeader: true }}
			/>
		</div>
	);
}

function DefaultSubscriptions({
	configuration,
	onSaved,
}: {
	configuration: NotificationConfiguration;
	onSaved: () => Promise<unknown>;
}) {
	return (
		<ModalForm
			title={m.telegram_default_subscriptions()}
			description={m.telegram_default_subscriptions_description()}
			trigger={
				<ProButton variant="outline">
					<Settings2 />
					{m.system_nav_settings()}
				</ProButton>
			}
			initialValues={{
				autoSubscribe: configuration.defaults.autoSubscribe,
				events: configuration.defaults.events,
				templateId:
					configuration.defaults.templateId ||
					configuration.templates[0]?.id ||
					"",
			}}
			schema={[
				{
					name: "autoSubscribe",
					label: m.telegram_auto_subscribe_on_start(),
					valueType: "switch",
				},
				{
					name: "templateId",
					label: m.telegram_templates(),
					valueType: "select",
					required: true,
					fieldProps: {
						options: configuration.templates.map((template) => ({
							label: template.name,
							value: template.id,
						})),
					},
				},
				{
					name: "events",
					render: (field) => (
						<WebhookEventMatrix
							value={eventValues(field.value)}
							onChange={field.onChange}
						/>
					),
				},
			]}
			onFinish={async (values) => {
				await updateTelegramDefaultsFn({
					data: {
						autoSubscribe: formBooleanValue(values.autoSubscribe),
						templateId: String(values.templateId ?? ""),
						events: eventValues(values.events).filter(isWebhookEventType),
					},
				});
				await onSaved();
				toast.success(m.payment_config_saved());
			}}
			onFinishFailed={showTelegramError}
		/>
	);
}

function CreateNotification({
	configuration,
	onCreated,
}: {
	configuration: NotificationConfiguration;
	onCreated: () => Promise<unknown>;
}) {
	return (
		<ModalForm
			title={m.common_new()}
			description={m.telegram_add_binding_description()}
			trigger={<ProButton>{m.common_new()}</ProButton>}
			schema={[
				{ name: "name", label: m.common_name(), required: true },
				{
					name: "botId",
					label: m.telegram_bot(),
					valueType: "select",
					required: true,
					fieldProps: {
						options: configuration.bots.map((bot) => ({
							label: bot.name,
							value: bot.id,
						})),
					},
				},
				{
					name: "templateId",
					label: m.telegram_templates(),
					valueType: "select",
					required: true,
					fieldProps: {
						options: configuration.templates.map((template) => ({
							label: template.name,
							value: template.id,
						})),
					},
				},
				{
					name: "targetType",
					label: m.telegram_target_type(),
					valueType: "select",
					required: true,
					fieldProps: {
						options: ["private", "group", "channel"].map((value) => ({
							label: telegramOptionLabel(value),
							value,
						})),
					},
				},
				{
					name: "targetId",
					label: m.telegram_target_id(),
					required: true,
					fieldProps: { placeholder: "-1001234567890" },
				},
				{
					name: "locale",
					label: m.telegram_locale(),
					valueType: "select",
					required: true,
					fieldProps: {
						options: supportedLocales.map((value) => ({
							label: localeLabels[value],
							value,
						})),
					},
				},
				{
					name: "events",
					required: true,
					render: (field) => (
						<WebhookEventMatrix
							value={eventValues(field.value)}
							onChange={field.onChange}
						/>
					),
				},
			]}
			initialValues={{
				events: ["order.paid", "order.overpaid", "order.expired"],
				locale: "en-US",
				targetType: "private",
				templateId: configuration.templates[0]?.id ?? "",
			}}
			onFinish={async (values) => {
				await createTelegramNotificationBindingFn({
					data: {
						botId: String(values.botId ?? ""),
						templateId: String(values.templateId ?? ""),
						name: String(values.name ?? ""),
						targetType: String(values.targetType ?? "private") as
							| "private"
							| "group"
							| "channel",
						targetId: String(values.targetId ?? ""),
						locale: String(values.locale ?? "en-US") as SupportedLocale,
						events: eventValues(values.events).filter(isWebhookEventType),
					},
				});
				await onCreated();
				toast.success(m.telegram_binding_added());
			}}
			onFinishFailed={showTelegramError}
		/>
	);
}
