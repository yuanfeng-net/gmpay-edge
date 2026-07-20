import { createFileRoute } from "@tanstack/react-router";
import { TelegramTemplatesPage } from "#/features/telegram/pages/templates";
import { validateProTableSearch } from "#/lib/pro-table-url-state";

export const Route = createFileRoute("/admin/telegram/templates")({
	validateSearch: validateProTableSearch,
	component: TelegramTemplatesPage,
});
