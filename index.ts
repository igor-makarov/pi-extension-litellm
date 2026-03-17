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

/**
 * Canonical slug for fuzzy ID matching across naming conventions:
 *   1. strip "provider." prefix  (e.g. "qwen."    from "qwen.qwen3-coder-480b-a35b-v1:0")
 *   2. strip "-vN…" version suffix (e.g. "-v1:0" from "qwen3-coder-480b-a35b-v1:0")
 *   3. collapse all separators → lowercase  ("qwen-3" === "qwen3")
 */
const slugify = (id: string) =>
	id.replace(/^[^.]+\./, "").replace(/-v\d.*$/i, "").replace(/[-._: /]/g, "").toLowerCase();

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

	// Exact-match against anthropic / openai / google
	const exactMatched = new Set<string>();
	const models = PROVIDERS.flatMap((provider) =>
		getModels(provider)
			.filter((model) => availableIds.has(model.id))
			.map((model) => {
				exactMatched.add(model.id);
				return {
					id: model.id,
					name: model.name,
					api: model.api,
					reasoning: model.reasoning,
					input: [...model.input] as ("text" | "image")[],
					cost: { ...model.cost },
					contextWindow: model.contextWindow,
					maxTokens: model.maxTokens,
				};
			}),
	);

	// Fuzzy-match remaining LiteLLM IDs against amazon-bedrock metadata.
	// Slug normalisation handles prefix aliases ("qwen." → "") and version
	// suffixes ("-v1:0" → "") so that e.g.:
	//   LiteLLM "qwen-3-coder-480b-a35b"  ↔  pi "qwen.qwen3-coder-480b-a35b-v1:0"
	//   LiteLLM "minimax-m2"              ↔  pi "minimax.minimax-m2"
	const slugMap = new Map<string, ReturnType<typeof getModels>[0]>();
	for (const model of getModels("amazon-bedrock")) {
		slugMap.set(slugify(model.id), model);
	}
	for (const litellmId of availableIds) {
		if (exactMatched.has(litellmId)) continue;
		const piModel = slugMap.get(slugify(litellmId));
		if (!piModel) continue;
		models.push({
			id: litellmId,
			name: piModel.name,
			api: piModel.api === "bedrock-converse-stream" ? "openai-completions" : piModel.api,
			reasoning: piModel.reasoning,
			input: [...piModel.input] as ("text" | "image")[],
			cost: { ...piModel.cost },
			contextWindow: piModel.contextWindow,
			maxTokens: piModel.maxTokens,
		});
	}

	if (models.length === 0) {
		console.error("LiteLLM: no models matched built-in metadata. Available:", [...availableIds].join(", "));
		return;
	}

	for (const model of models) {
		console.log(`LiteLLM model ${model.id} api: ${model.api}`);
	}

	pi.registerProvider("litellm", {
		baseUrl,
		apiKey: "LITELLM_API_KEY",
		models,
	});
}
