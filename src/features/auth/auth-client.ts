import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { localizeHref } from "#/paraglide/runtime";

export const authClient = createAuthClient({
	plugins: [
		twoFactorClient({
			onTwoFactorRedirect: () => {
				if (typeof window !== "undefined")
					window.location.assign(localizeHref("/two-factor"));
			},
		}),
	],
});
