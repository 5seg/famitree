<script setup lang="ts">
import { watch } from 'vue';
import confetti from 'canvas-confetti';
import { Sparkles } from 'lucide-vue-next';
import { useModalA11y } from '../composables/useModalA11y';

const props = defineProps<{
  isOpen: boolean;
  streak: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

useModalA11y(() => props.isOpen, () => emit('close'));

let confettiTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => props.isOpen,
  (newVal) => {
    if (newVal) {
      clearTimeout(confettiTimer);
      confettiTimer = setTimeout(() => {
        confetti({
          particleCount: 50,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#10b981', '#34d399', '#06b6d4', '#fbbf24', '#f472b6'],
        });
      }, 50);
    }
  }
);
</script>

<template>
  <div
    v-if="isOpen"
    @click.self="$emit('close')"
    role="dialog"
    aria-modal="true"
    aria-labelledby="watering-modal-title"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs"
  >
    <div
      class="bg-white rounded-3xl p-6 max-w-xs w-full shadow-2xl border border-stone-200 text-center relative overflow-hidden transition-all duration-300 transform scale-100"
    >
      <div class="absolute -top-12 -right-12 w-32 h-32 bg-emerald-100 rounded-full blur-2xl pointer-events-none" />
      <div class="absolute -bottom-12 -left-12 w-32 h-32 bg-amber-100 rounded-full blur-2xl pointer-events-none" />

      <!-- Celebration Icon -->
      <div class="mx-auto w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mb-3 relative">
        <span class="text-3xl animate-bounce">🌱</span>
        <Sparkles class="w-5 h-5 text-amber-500 absolute -top-1 -right-1 fill-amber-400" />
      </div>

      <h3 id="watering-modal-title" class="text-base font-bold text-stone-800">水やり完了！</h3>

      <p class="mt-2 text-xs font-semibold text-emerald-800 bg-emerald-50/90 py-2 px-3 rounded-2xl border border-emerald-200/80">
        今日の水やりが完了しました！<br />
        連続記録 <span class="text-sm font-bold text-emerald-600">{{ streak }}日目</span> 達成 🎉
      </p>

      <p class="mt-2.5 text-[11px] text-stone-600 leading-relaxed">
        木に栄養が行き届きました。<br />
        今日も無理せず、よい一日を！
      </p>

      <div class="mt-5">
        <button
          @click="$emit('close')"
          class="w-full py-2.5 px-4 rounded-2xl bg-stone-800 hover:bg-stone-900 text-white font-semibold text-xs transition-colors shadow-sm cursor-pointer"
        >
          木に戻る
        </button>
      </div>
    </div>
  </div>
</template>
