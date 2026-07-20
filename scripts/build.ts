import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

type WranglerConfig = {
	d1_databases?: Array<{ binding?: string; database_name?: string }>;
	kv_namespaces?: Array<{ binding?: string }>;
	r2_buckets?: Array<{ bucket_name?: string }>;
	queues?: {
		producers?: Array<{ queue?: string }>;
		consumers?: Array<{ queue?: string; dead_letter_queue?: string }>;
	};
};

const wranglerConfigPath = fileURLToPath(
	new URL("../wrangler.jsonc", import.meta.url),
);

function run(command: string, arguments_: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, arguments_, { stdio: "inherit" });
		child.once("error", reject);
		child.once("close", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`${command} exited with code ${code ?? 1}.`));
		});
	});
}

async function resourceExists(arguments_: string[]): Promise<boolean> {
	return new Promise((resolve, reject) => {
		const child = spawn("wrangler", arguments_, { stdio: "ignore" });
		child.once("error", reject);
		child.once("close", (code) => resolve(code === 0));
	});
}

async function ensureNamedResource(
	infoArguments: string[],
	createArguments: string[],
): Promise<void> {
	if (await resourceExists(infoArguments)) return;
	try {
		await run("wrangler", createArguments);
	} catch (error) {
		if (await resourceExists(infoArguments)) return;
		throw error;
	}
}

async function buildForWorkers(): Promise<void> {
	const config = JSON.parse(
		await readFile(wranglerConfigPath, "utf8"),
	) as WranglerConfig;
	const database = config.d1_databases?.find(
		(binding) => binding.binding === "DB",
	);
	const cache = config.kv_namespaces?.find(
		(binding) => binding.binding === "CACHE",
	);
	if (!database || !cache || typeof database.database_name !== "string") {
		throw new Error("Missing DB or CACHE binding in wrangler.jsonc.");
	}

	const databaseName = database.database_name;
	const bucketNames = (config.r2_buckets ?? []).flatMap((bucket) =>
		bucket.bucket_name ? [bucket.bucket_name] : [],
	);
	const queueNames = [
		...(config.queues?.producers ?? []).flatMap((producer) =>
			producer.queue ? [producer.queue] : [],
		),
		...(config.queues?.consumers ?? []).flatMap((consumer) => [
			...(consumer.queue ? [consumer.queue] : []),
			...(consumer.dead_letter_queue ? [consumer.dead_letter_queue] : []),
		]),
	];

	await Promise.all([
		ensureNamedResource(
			["d1", "info", databaseName, "--json"],
			["d1", "create", databaseName],
		),
		...bucketNames.map((name) =>
			ensureNamedResource(
				["r2", "bucket", "info", name, "--json"],
				["r2", "bucket", "create", name],
			),
		),
		...[...new Set(queueNames)].map((name) =>
			ensureNamedResource(["queues", "info", name], ["queues", "create", name]),
		),
	]);
	await run("wrangler", ["d1", "migrations", "apply", "DB", "--remote"]);
	await run("vite", ["build"]);
}

if (process.argv.includes("--remote") || process.env.WORKERS_CI === "1") {
	await buildForWorkers();
} else {
	await run("vite", ["build"]);
}
