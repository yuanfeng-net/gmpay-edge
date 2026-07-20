import { createFileRoute } from "@tanstack/react-router";
import { CheckoutPage } from "#/features/checkout/pages/checkout";
import { getCheckoutOrderFn } from "#/features/checkout/server/functions";

export const Route = createFileRoute("/checkout/$orderId")({
	loader: async ({ params }) => ({
		order: await getCheckoutOrderFn({ data: { orderId: params.orderId } }),
		renderedAt: Date.now(),
	}),
	component: CheckoutRoute,
});

function CheckoutRoute() {
	const { orderId } = Route.useParams();
	const { order, renderedAt } = Route.useLoaderData();
	return (
		<CheckoutPage
			initialNow={renderedAt}
			initialOrder={order}
			orderId={orderId}
		/>
	);
}
