import { paraglideMiddleware } from "#/paraglide/server";

export function handleI18nRequest(
	request: Request,
	resolve: (request: Request) => Response | Promise<Response>,
) {
	return paraglideMiddleware(request, () => resolve(request));
}
