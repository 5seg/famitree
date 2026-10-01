<script setup lang="ts">
import { Droplets, Sparkles, Camera, Bell } from 'lucide-vue-next';

defineProps<{
  hasWateredToday: boolean;
}>();

defineEmits<{
  (e: 'waterTree'): void;
  (e: 'openAddModal'): void;
  (e: 'openNudgeModal'): void;
}>();
</script>

<template>
  <div class="px-4 pt-1 pb-4 flex flex-col gap-2.5">
    <!-- Primary Big Watering Button -->
    <button
      @click="$emit('waterTree')"
      :disabled="hasWateredToday"
      class="w-full py-4 px-6 rounded-3xl font-bold flex items-center justify-center gap-2.5 text-base shadow-lg transition-all duration-300 relative overflow-hidden group cursor-pointer"
      :class="[
        hasWateredToday
          ? 'bg-gradient-to-r from-emerald-100 to-teal-100 border border-emerald-300/80 text-emerald-800 shadow-emerald-900/5 cursor-default'
          : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 text-white shadow-emerald-700/25 hover:shadow-emerald-700/35 hover:brightness-105 active:scale-98'
      ]"
    >
      <template v-if="hasWateredToday">
        <Sparkles class="w-5 h-5 text-emerald-600 animate-spin" style="animation-duration: 6s;" />
        <span class="tracking-wide">✨ 本日の水やり完了</span>
      </template>
      <template v-else>
        <Droplets class="w-5 h-5 fill-white animate-bounce" />
        <span class="tracking-wide">💧 今日の水やりをする</span>
      </template>
    </button>

    <!-- Secondary Action Row: Add Memories & Friendly Nudge -->
    <div class="flex items-center gap-2">
      <!-- Secondary Action Button: Add Content -->
      <button
        @click="$emit('openAddModal')"
        class="flex-1 py-3 px-3.5 rounded-2xl bg-amber-50 hover:bg-amber-100/80 border border-amber-200/90 text-amber-900 font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors active:scale-98 cursor-pointer"
      >
        <Camera class="w-4 h-4 text-amber-700" />
        <span>📸 木を彩る（写真・言葉）</span>
      </button>

      <!-- Nudge / Help Button -->
      <button
        @click="$emit('openNudgeModal')"
        class="py-3 px-3.5 rounded-2xl bg-stone-100 hover:bg-stone-200/80 border border-stone-200 text-stone-700 font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors whitespace-nowrap active:scale-98 cursor-pointer"
        title="家族へやさしい水やり通知"
      >
        <Bell class="w-3.5 h-3.5 text-emerald-600" />
        <span>🌱 水やりを促す</span>
      </button>
    </div>
  </div>
</template>
