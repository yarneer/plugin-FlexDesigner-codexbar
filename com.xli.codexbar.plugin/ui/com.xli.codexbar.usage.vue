<template>
  <v-container class="pa-4">
    <v-card elevation="2" class="rounded-lg">
      <v-card-item>
        <v-card-title class="text-h6 font-weight-regular">{{ $t('Usage.Title') }}</v-card-title>
        <v-card-subtitle>{{ $t('Usage.Tip') }}</v-card-subtitle>
      </v-card-item>
    </v-card>
  </v-container>
</template>

<script>
export default {
  name: 'CodexBarUsageKey',
  props: {
    modelValue: {
      type: Object,
      required: true
    }
  }
}
</script>
