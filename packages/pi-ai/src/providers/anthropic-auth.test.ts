import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { usesAnthropicBearerAuth, resolveAnthropicBaseUrl, isFlowAuthToken } from "./anthropic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("usesAnthropicBearerAuth covers Bearer-only Anthropic-compatible providers (#3783)", () => {
	assert.equal(usesAnthropicBearerAuth("alibaba-coding-plan"), true);
	assert.equal(usesAnthropicBearerAuth("minimax"), true);
	assert.equal(usesAnthropicBearerAuth("minimax-cn"), true);
	assert.equal(usesAnthropicBearerAuth("anthropic"), false);
});

test("createClient routes Bearer-auth providers through authToken (#3783)", () => {
	const source = readFileSync(join(__dirname, "..", "..", "src", "providers", "anthropic.ts"), "utf-8");
	assert.ok(
		source.includes("const usesBearerAuth = usesAnthropicBearerAuth(model.provider)"),
		"createClient should derive auth mode from usesAnthropicBearerAuth",
	);
	assert.ok(
		source.includes("apiKey: usesBearerAuth ? null : apiKey"),
		"Bearer-auth providers should skip x-api-key auth",
	);
	assert.ok(
		source.includes("authToken: usesBearerAuth ? apiKey : undefined"),
		"Bearer-auth providers should send authToken instead",
	);
});

// Minimal model stub — only the field resolveAnthropicBaseUrl cares about.
const stubModel = { baseUrl: "https://api.anthropic.com" } as Parameters<typeof resolveAnthropicBaseUrl>[0];

test("resolveAnthropicBaseUrl returns model.baseUrl when ANTHROPIC_BASE_URL is unset (#4140)", (t) => {
	const saved = process.env.ANTHROPIC_BASE_URL;
	t.after(() => {
		if (saved === undefined) delete process.env.ANTHROPIC_BASE_URL;
		else process.env.ANTHROPIC_BASE_URL = saved;
	});

	delete process.env.ANTHROPIC_BASE_URL;
	assert.equal(resolveAnthropicBaseUrl(stubModel), "https://api.anthropic.com");
});

test("resolveAnthropicBaseUrl prefers ANTHROPIC_BASE_URL over model.baseUrl (#4140)", (t) => {
	const saved = process.env.ANTHROPIC_BASE_URL;
	t.after(() => {
		if (saved === undefined) delete process.env.ANTHROPIC_BASE_URL;
		else process.env.ANTHROPIC_BASE_URL = saved;
	});

	process.env.ANTHROPIC_BASE_URL = "https://proxy.example.com";
	assert.equal(resolveAnthropicBaseUrl(stubModel), "https://proxy.example.com");
});

test("resolveAnthropicBaseUrl ignores whitespace-only ANTHROPIC_BASE_URL (#4140)", (t) => {
	const saved = process.env.ANTHROPIC_BASE_URL;
	t.after(() => {
		if (saved === undefined) delete process.env.ANTHROPIC_BASE_URL;
		else process.env.ANTHROPIC_BASE_URL = saved;
	});

	process.env.ANTHROPIC_BASE_URL = "   ";
	assert.equal(resolveAnthropicBaseUrl(stubModel), "https://api.anthropic.com");
});

test("createClient uses resolveAnthropicBaseUrl for all auth paths (#4140)", () => {
	const source = readFileSync(join(__dirname, "..", "..", "src", "providers", "anthropic.ts"), "utf-8");
	const directUsages = (source.match(/baseURL:\s*model\.baseUrl/g) ?? []).length;
	assert.equal(directUsages, 0, "createClient must not use model.baseUrl directly — use resolveAnthropicBaseUrl(model)");
	assert.ok(
		source.includes("baseURL: resolveAnthropicBaseUrl(model)"),
		"all createClient branches should pass baseURL through resolveAnthropicBaseUrl",
	);
});

// ---------------------------------------------------------------------------
// Flow proxy integration tests
// ---------------------------------------------------------------------------

function withEnv(overrides: Record<string, string | undefined>, fn: () => void): void {
	const saved: Record<string, string | undefined> = {};
	for (const key of Object.keys(overrides)) {
		saved[key] = process.env[key];
	}
	try {
		for (const [key, value] of Object.entries(overrides)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		fn();
	} finally {
		for (const [key, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

test("getEnvApiKey reads ANTHROPIC_AUTH_TOKEN first for anthropic provider", () => {
	const source = readFileSync(join(__dirname, "..", "..", "src", "env-api-keys.ts"), "utf-8");
	assert.ok(
		source.includes("process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY"),
		"ANTHROPIC_AUTH_TOKEN must be checked first in getEnvApiKey for the anthropic provider",
	);
});

test("web-runtime getEnvApiKey reads ANTHROPIC_AUTH_TOKEN first for anthropic provider", () => {
	const source = readFileSync(join(__dirname, "..", "..", "src", "web-runtime-env-api-keys.ts"), "utf-8");
	assert.ok(
		source.includes("process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY"),
		"web-runtime ANTHROPIC_AUTH_TOKEN must be checked first for the anthropic provider",
	);
});

test("isFlowAuthToken returns true when ANTHROPIC_AUTH_TOKEN is set", (t) => {
	const saved = process.env.ANTHROPIC_AUTH_TOKEN;
	t.after(() => {
		if (saved === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN;
		else process.env.ANTHROPIC_AUTH_TOKEN = saved;
	});

	process.env.ANTHROPIC_AUTH_TOKEN = "flow-jwt";
	assert.equal(isFlowAuthToken(), true);
});

test("isFlowAuthToken returns false when ANTHROPIC_AUTH_TOKEN is unset", (t) => {
	const saved = process.env.ANTHROPIC_AUTH_TOKEN;
	t.after(() => {
		if (saved === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN;
		else process.env.ANTHROPIC_AUTH_TOKEN = saved;
	});

	delete process.env.ANTHROPIC_AUTH_TOKEN;
	assert.equal(isFlowAuthToken(), false);
});

test("createClient activates Bearer auth when ANTHROPIC_AUTH_TOKEN is set", () => {
	const source = readFileSync(join(__dirname, "..", "..", "src", "providers", "anthropic.ts"), "utf-8");
	assert.ok(
		source.includes("|| isFlowAuthToken()"),
		"usesBearerAuth derivation must include isFlowAuthToken()",
	);
});

test("CLAUDE_CODE_DISABLE_THINKING=1 suppresses adaptive thinking in buildParams", () => {
	const source = readFileSync(join(__dirname, "..", "..", "src", "providers", "anthropic-shared.ts"), "utf-8");
	assert.ok(
		source.includes('const thinkingDisabledByEnv = process.env.CLAUDE_CODE_DISABLE_THINKING === "1"'),
		"buildParams must read CLAUDE_CODE_DISABLE_THINKING env var",
	);
	assert.ok(
		source.includes("&& !thinkingDisabledByEnv"),
		"buildParams must gate thinking on thinkingDisabledByEnv",
	);
});

test("CLAUDE_CODE_DISABLE_THINKING=1 suppresses adaptive thinking in buildSdkOptions", () => {
	const source = readFileSync(join(__dirname, "..", "..", "..", "..", "src", "resources", "extensions", "claude-code-cli", "stream-adapter.ts"), "utf-8");
	assert.ok(
		source.includes('const thinkingDisabledByEnv = process.env.CLAUDE_CODE_DISABLE_THINKING === "1"'),
		"buildSdkOptions must read CLAUDE_CODE_DISABLE_THINKING env var",
	);
});

test("CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1 suppresses beta headers in createClient", () => {
	const source = readFileSync(join(__dirname, "..", "..", "src", "providers", "anthropic.ts"), "utf-8");
	assert.ok(
		source.includes('process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS === "1"'),
		"skipBetaHeaders must check CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS env var",
	);
});
