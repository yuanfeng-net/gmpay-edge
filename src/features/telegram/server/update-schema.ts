import { z } from "zod";

const telegramUserSchema = z.object({
	id: z.number().int(),
	language_code: z.string().max(35).optional(),
	username: z.string().max(32).optional(),
	first_name: z.string().max(64).optional(),
});
const telegramMessageSchema = z.object({
	chat: z.object({ id: z.number().int() }),
	from: telegramUserSchema.optional(),
	text: z.string().max(4_096).optional(),
});
const telegramUpdateSchema = z
	.object({
		update_id: z.number().int().nonnegative(),
		message: telegramMessageSchema.optional(),
		inline_query: z
			.object({
				id: z.string().min(1).max(128),
				from: telegramUserSchema,
				query: z.string().max(256),
			})
			.optional(),
		chosen_inline_result: z
			.object({
				result_id: z.string().min(1).max(128),
				from: telegramUserSchema,
				query: z.string().max(256),
				inline_message_id: z.string().min(1).max(512).optional(),
			})
			.optional(),
		callback_query: z
			.object({
				id: z.string().min(1).max(128),
				from: telegramUserSchema,
				data: z.string().max(64).optional(),
				message: telegramMessageSchema.optional(),
			})
			.optional(),
	})
	.refine((update) =>
		Boolean(
			update.message ||
				update.inline_query ||
				update.chosen_inline_result ||
				update.callback_query,
		),
	);

export type TelegramUpdateInput = z.infer<typeof telegramUpdateSchema>;

export function parseTelegramUpdate(value: unknown) {
	return telegramUpdateSchema.safeParse(value);
}
