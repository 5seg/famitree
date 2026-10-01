<script setup lang="ts">
import { Sparkles, Flame, Info, ChevronDown } from 'lucide-vue-next';

defineProps<{
  streak: number;
  treeLevel: number;
  expPercent: number;
}>();

defineEmits<{
  (e: 'openInfo'): void;
  (e: 'switchFamily'): void;
}>();
</script>

<template>
  <header class="px-4 pt-4 pb-2 bg-gradient-to-b from-stone-50/90 to-transparent sticky top-0 z-20 backdrop-blur-xs">
    <div class="flex items-center justify-between">
      <!-- Family Group Title -->
      <button
        @click="$emit('switchFamily')"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-amber-50/90 border border-amber-200/80 shadow-xs hover:bg-amber-100/80 transition-all text-left group cursor-pointer"
      >
        <span class="text-lg">🏡</span>
        <div>
          <div class="flex items-center gap-1">
            <span class="text-xs font-bold text-stone-800 tracking-tight">ひだまりファミリーの木</span>
            <ChevronDown class="w-3.5 h-3.5 text-stone-500 group-hover:translate-y-0.5 transition-transform" />
          </div>
          <span class="text-[10px] text-stone-500">4人の庭</span>
        </div>
      </button>

      <!-- Info / Settings Button -->
      <button
        @click="$emit('openInfo')"
        class="w-8 h-8 rounded-full bg-stone-100/90 border border-stone-200/60 flex items-center justify-center text-stone-600 hover:bg-stone-200 transition-colors shadow-xs cursor-pointer"
        title="FamiTreeについて"
        aria-label="FamiTreeについて"
      >
        <Info class="w-4 h-4" />
      </button>
    </div>

    <!-- Status Badges Row -->
    <div class="flex items-center gap-2 mt-2.5">
      <!-- Streak Counter Badge -->
      <div
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 shadow-xs text-xs font-semibold animate-pulse"
      >
        <Flame class="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
        <span>{{ streak }}日連続</span>
      </div>

      <!-- Tree Level & Exp Badge -->
      <div class="flex-1 flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 shadow-xs text-xs">
        <Sparkles class="w-3.5 h-3.5 text-emerald-600" />
        <span class="font-semibold whitespace-nowrap">Lv.{{ treeLevel }} 若木</span>
        <div class="w-full bg-emerald-200/60 h-1.5 rounded-full overflow-hidden">
          <div
            class="bg-emerald-500 h-full rounded-full transition-all duration-700 ease-out"
            :style="{ width: `${expPercent}%` }"
          />
        </div>
        <span class="text-[10px] text-emerald-600 font-mono font-medium">{{ expPercent }}%</span>
      </div>
    </div>
  </header>
</template>
