<script setup lang="ts">
import { ref } from 'vue';
import { Sliders, RefreshCw, ChevronUp, ChevronDown, Check, Zap } from 'lucide-vue-next';
import type { TreeState } from '../types';

defineProps<{
  treeState: TreeState;
  userWatered: boolean;
  streak: number;
}>();

defineEmits<{
  (e: 'updateTreeState', state: TreeState): void;
  (e: 'toggleUserWatered'): void;
  (e: 'resetStreak'): void;
  (e: 'levelUp'): void;
}>();

const isOpen = ref(false);
const treeStates: TreeState[] = ['thriving', 'growing', 'wilting', 'hibernating'];
</script>

<template>
  <div class="fixed bottom-4 right-4 z-40">
    <!-- Collapsed Toggle Button -->
    <button
      @click="isOpen = !isOpen"
      class="px-3 py-2 rounded-full bg-stone-900/90 hover:bg-stone-950 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xl border border-stone-700 backdrop-blur-md cursor-pointer hover:scale-105 active:scale-95 transition-all"
    >
      <Sliders class="w-3.5 h-3.5 text-amber-400" />
      <span>審査員・デモ操作</span>
      <ChevronDown v-if="isOpen" class="w-3 h-3 text-stone-400" />
      <ChevronUp v-else class="w-3 h-3 text-stone-400" />
    </button>

    <!-- Expanded Control Box -->
    <div
      v-if="isOpen"
      class="absolute bottom-12 right-0 w-72 bg-stone-900/95 text-stone-100 p-4 rounded-3xl shadow-2xl border border-stone-700 backdrop-blur-md text-xs space-y-3"
    >
      <div class="flex items-center justify-between pb-2 border-b border-stone-800">
        <span class="font-bold text-amber-300 flex items-center gap-1">
          <Sliders class="w-3.5 h-3.5" /> デモ切替コントロール
        </span>
        <span class="text-[10px] text-stone-400 font-mono">Streak: {{ streak }}d</span>
      </div>

      <!-- Tree State Toggle Buttons -->
      <div>
        <label class="block text-[11px] font-medium text-stone-300 mb-1.5">
          木の健康状態 (Tree State):
        </label>
        <div class="grid grid-cols-2 gap-1.5">
          <button
            v-for="st in treeStates"
            :key="st"
            @click="$emit('updateTreeState', st)"
            class="py-1.5 px-2 rounded-xl text-[11px] font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer"
            :class="treeState === st ? 'bg-emerald-600 text-white shadow-xs' : 'bg-stone-800 text-stone-400 hover:bg-stone-700'"
          >
            <Check v-if="treeState === st" class="w-3 h-3 text-emerald-200" />
            <span v-if="st === 'thriving'">🌸 満開 (thriving)</span>
            <span v-else-if="st === 'growing'">🌱 成長 (growing)</span>
            <span v-else-if="st === 'wilting'">🍂 枯れ (wilting)</span>
            <span v-else-if="st === 'hibernating'">💤 休息 (hibernating)</span>
          </button>
        </div>
      </div>

      <!-- User Watered Status Toggle -->
      <div class="pt-2 border-t border-stone-800 flex items-center justify-between">
        <div>
          <span class="block font-medium text-stone-200">水やり状態テスト</span>
          <span class="text-[10px] text-stone-400">
            {{ userWatered ? '現在: 水やり済み' : '現在: 未水やり' }}
          </span>
        </div>
        <button
          @click="$emit('toggleUserWatered')"
          class="px-3 py-1 rounded-xl text-[11px] font-bold transition-colors cursor-pointer"
          :class="userWatered ? 'bg-amber-600/80 hover:bg-amber-600 text-white' : 'bg-emerald-600/80 hover:bg-emerald-600 text-white'"
        >
          {{ userWatered ? '未済に戻す' : '水やり済にする' }}
        </button>
      </div>

      <!-- Streak & Level Controls -->
      <div class="pt-2 border-t border-stone-800 grid grid-cols-2 gap-2">
        <button
          @click="$emit('levelUp')"
          class="py-1.5 px-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 flex items-center justify-center gap-1 transition-colors cursor-pointer"
        >
          <Zap class="w-3 h-3 text-amber-400" />
          <span>Lv/Expを増やす</span>
        </button>
        <button
          @click="$emit('resetStreak')"
          class="py-1.5 px-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center gap-1 transition-colors cursor-pointer"
        >
          <RefreshCw class="w-3 h-3" />
          <span>連続リセット</span>
        </button>
      </div>
    </div>
  </div>
</template>
