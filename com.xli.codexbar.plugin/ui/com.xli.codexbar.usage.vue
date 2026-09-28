<template>
  <v-container class="pa-4">
    <v-card elevation="2" class="rounded-lg">
      <v-card-item>
        <v-card-title class="text-h6 font-weight-regular">{{ $t('Usage.Title') }}</v-card-title>
        <v-card-subtitle>{{ $t('Usage.Tip') }}</v-card-subtitle>
      </v-card-item>

      <v-card-text class="pt-0">
        <v-select
          v-model="modelValue.data.provider"
          :items="providerItems"
          :label="$t('Config.Provider')"
          :hint="$t('Config.ProviderHint')"
          persistent-hint
          density="compact"
          variant="outlined"
        ></v-select>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script>
// Every id accepted by `codexbar usage --provider` (CodexBar 0.67.0 help),
// the commonly used ones first. "both" and "all" are special CLI values,
// not providers, and are intentionally absent.
const COMMON_PROVIDERS = ['codex', 'claude', 'cursor', 'gemini', 'copilot', 'zai', 'kimi'];

const OTHER_PROVIDERS = [
  'openai', 'azure-openai', 'clinepass', 'opencode', 'opencodego',
  'alibaba-coding-plan', 'alibaba-token-plan', 'qwen-cloud', 'factory', 'fireworks',
  'antigravity', 'devin', 'minimax', 'manus', 'kilo', 'kiro', 'vertexai', 'augment',
  'jetbrains', 'moonshot', 'amp', 't3chat', 'ollama', 'synthetic', 'openrouter',
  'elevenlabs', 'warp', 'windsurf', 'zed', 'perplexity', 'mimo', 'doubao', 'sakana',
  'abacusai', 'mistral', 'deepseek', 'deepinfra', 'codebuff', 'venice', 'commandcode',
  'qoder', 'stepfun', 'bedrock', 'grok', 'groqcloud', 'llmproxy', 'litellm', 'bifrost',
  'aixy', 'deepgram', 'poe', 'chutes', 'neuralwatt', 'helmcode', 'clawrouter', 'longcat',
  'sub2api', 'wayfinder', 'zenmux', 'aiand', 'zoommate', 'xai', 'notion', 'ibmbob',
  'nous', 'muse', 'coderabbit', 'replicate', 'huggingface', 'raycast', 'pi', 'v0',
  'typesafe', 'hyper', 'gitkraken', 'devpass', 'atlascloud', 'vercel', 'llmman', 'xkiro'
];

export default {
  name: 'CodexBarUsageKey',
  props: {
    modelValue: {
      type: Object,
      required: true
    }
  },
  computed: {
    providerItems() {
      return [...COMMON_PROVIDERS, ...OTHER_PROVIDERS];
    }
  },
  created() {
    if (!this.modelValue.data.provider) this.modelValue.data.provider = 'codex';
  }
}
</script>
