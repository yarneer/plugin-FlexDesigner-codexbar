<template>
  <v-container class="pa-4">
    <v-card elevation="2" class="mb-4 rounded-lg">
      <v-card-item prepend-icon="mdi-gauge">
        <v-card-title>{{ $t('PluginName') }}</v-card-title>
        <v-card-subtitle>{{ $t('Config.Interval') }}</v-card-subtitle>
      </v-card-item>
      <v-divider></v-divider>

      <v-card-text>
        <v-text-field
          v-model.number="modelValue.config.intervalSeconds"
          :label="$t('Config.Interval')"
          :hint="$t('Config.IntervalHint')"
          type="number"
          min="10"
          step="10"
          persistent-hint
          density="compact"
          variant="outlined"
        ></v-text-field>

        <v-text-field
          v-model="modelValue.config.codexbarPath"
          :label="$t('Config.Path')"
          :hint="$t('Config.PathHint')"
          persistent-hint
          density="compact"
          variant="outlined"
          class="mt-4"
        ></v-text-field>
      </v-card-text>
    </v-card>

    <v-alert type="info" variant="tonal" density="comfortable">
      {{ $t('Config.Note') }}
    </v-alert>
  </v-container>
</template>

<script>
export default {
  name: 'CodexBarConfigPage',
  props: {
    modelValue: {
      type: Object,
      required: true
    }
  },
  created() {
    if (!this.modelValue.config.intervalSeconds) this.modelValue.config.intervalSeconds = 120;
    if (this.modelValue.config.codexbarPath === undefined) this.modelValue.config.codexbarPath = '';
  }
}
</script>
