import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { getContext, ssrQueryDehydrateOptions } from "./context/tanstack-query";
import { deLocalizeUrl, localizeUrl } from "./paraglide/runtime";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const context = getContext();

	const router = createTanStackRouter({
		routeTree,
		context,
		rewrite: {
			input: ({ url }) => {
				if (shouldSkipLocaleRewrite(url.pathname)) return;
				return deLocalizeUrl(url);
			},
			output: ({ url }) => {
				if (shouldSkipLocaleRewrite(url.pathname)) return;
				return localizeUrl(url);
			},
		},
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 30_000,
	});

	setupRouterSsrQueryIntegration({
		router,
		queryClient: context.queryClient,
		dehydrateOptions: ssrQueryDehydrateOptions,
	});

	return router;
}

function shouldSkipLocaleRewrite(pathname: string) {
	if (pathname === "/api" || pathname.startsWith("/api/")) return true;
	if (pathname.startsWith("/_")) return true;
	if (pathname.startsWith("/@")) return true;
	if (pathname.startsWith("/node_modules/")) return true;
	if (pathname.includes(".")) return true;
	return false;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
