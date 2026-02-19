/**
 * LiteLLM Provider Extension
 *
 * Registers Anthropic, OpenAI, and Google models under a "litellm" provider,
 * routing through LiteLLM's OpenAI-compatible proxy.
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

export default function (pi: ExtensionAPI) {
	const baseUrl = process.env.LITELLM_BASE_URL || DEFAULT_BASE_URL;

	const models = PROVIDERS.flatMap((provider) =>
		getModels(provider).map((model) => ({
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

	pi.registerProvider("litellm", {
		baseUrl,
		apiKey: "LITELLM_API_KEY",
		models,
	});
}
