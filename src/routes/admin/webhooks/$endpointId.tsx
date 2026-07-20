import { createFileRoute } from "@tanstack/react-router";
import { InboundWebhookEndpointPage } from "#/features/webhooks/pages/admin-inbound";
import { validateProTableSearch } from "#/lib/pro-table-url-state";

export const Route = createFileRoute("/admin/webhooks/$endpointId")({
	validateSearch: validateProTableSearch,
	component: EndpointRoute,
});

function EndpointRoute() {
	const { endpointId } = Route.useParams();
	return <InboundWebhookEndpointPage endpointId={endpointId} />;
}
