import { createFileRoute } from "@tanstack/react-router";
import { TelegramUsersPage } from "#/features/telegram/pages/users";
import { validateProTableSearch } from "#/lib/pro-table-url-state";

export const Route = createFileRoute("/admin/telegram/users")({
	validateSearch: validateProTableSearch,
	component: TelegramUsersPage,
});
