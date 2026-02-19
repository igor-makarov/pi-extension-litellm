/**
 * LiteLLM Provider Extension
 *
 * Fetches available models from LiteLLM's /v1/models endpoint, then
 * matches them against pi's built-in model metadata for Anthropic,
 * OpenAI, and Google providers.
 *
 * Usage:
 *   LITELLM_BASE_URL=https://litellm.example.com LITELLM_API_KEY=sk-... pi -e ~/private/pi-extension-litellm
 *
 * Then use /model to select any model under the "litellm" provider.
 */

import { getModels } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const DEFAULT_BASE_URL = "http://localhost:4000/v1";
const PROVIDERS = ["anthropic", "openai", "google"] as const;

export default async function (pi: ExtensionAPI) {
	const baseUrl = process.env.LITELLM_BASE_URL || DEFAULT_BASE_URL;
	const apiKey = process.env.LITELLM_API_KEY;

	// Fetch available model IDs from LiteLLM
	let availableIds: Set<string>;
	try {
		const headers: Record<string, string> = {};
		if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

		const res = await fetch(`${baseUrl}/models`, { headers });
		if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
		const data = (await res.json()) as { data: Array<{ id: string }> };
		availableIds = new Set(data.data.map((m) => m.id));
	} catch (e) {
		console.error(`Failed to fetch LiteLLM models from ${baseUrl}/models:`, e);
		return;
	}

	// Match against built-in model metadata
	const models = PROVIDERS.flatMap((provider) =>
		getModels(provider)
			.filter((model) => availableIds.has(model.id))
			.map((model) => ({
				id: model.id,
				name: model.name,
				api: model.api,
				reasoning: model.reasoning,
				input: [...model.input] as ("text" | "image")[],
				cost: { ...model.cost },
				contextWindow: model.contextWindow,
				maxTokens: model.maxTokens,
			})),
	);

	if (models.length === 0) {
		console.error("LiteLLM: no models matched built-in metadata. Available:", [...availableIds].join(", "));
		return;
	}

	pi.registerProvider("litellm", {
		baseUrl,
		apiKey: "LITELLM_API_KEY",
		models,
	});
}
