<template>
  <v-container class="pa-4">
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
  }
}
</script>
