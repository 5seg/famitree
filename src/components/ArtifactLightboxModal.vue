<script setup lang="ts">
import { X, MessageCircleHeart, Calendar } from 'lucide-vue-next';
import { useModalA11y } from '../composables/useModalA11y';
import type { TreeArtifact } from '../types';

const props = defineProps<{
  artifact: TreeArtifact | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

useModalA11y(() => props.artifact !== null, () => emit('close'));
</script>

<template>
  <div
    v-if="artifact"
    @click.self="$emit('close')"
    role="dialog"
    aria-modal="true"
    aria-label="思い出の詳細"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm"
  >
    <div
      class="bg-stone-50 rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-stone-200 text-stone-800 relative overflow-hidden"
    >
      <!-- Close Button -->
      <button
        @click="$emit('close')"
        aria-label="閉じる"
        class="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center text-stone-700 transition-colors cursor-pointer"
      >
        <X class="w-4 h-4" />
      </button>

      <!-- Content Display -->
      <div v-if="artifact.type === 'photo'" class="bg-white p-2.5 pb-4 rounded-xl shadow-polaroid border border-stone-200">
        <div class="rounded-lg overflow-hidden max-h-60 bg-stone-100 flex items-center justify-center">
          <img
            :src="artifact.content"
            :alt="artifact.title"
            referrerpolicy="no-referrer"
            class="w-full h-full object-cover"
          />
        </div>
        <h4 class="mt-3 text-sm font-bold text-stone-800 text-center">
          {{ artifact.title }}
        </h4>
      </div>

      <div v-else class="wood-grain p-5 rounded-2xl shadow-wooden border border-amber-900/60 text-center my-2">
        <div class="inline-block px-3 py-1 rounded-full bg-black/20 text-amber-200 text-[11px] font-medium mb-3">
          🪵 刻まれた言葉
        </div>
        <p class="text-base font-bold text-stone-100 leading-relaxed drop-shadow-sm">
          「{{ artifact.content }}」
        </p>
      </div>

      <!-- Author and Date Meta -->
      <div class="mt-4 flex items-center justify-between text-xs text-stone-500 border-t border-stone-200/80 pt-3">
        <div class="flex items-center gap-1.5">
          <span class="text-base">{{ artifact.authorAvatar }}</span>
          <span class="font-semibold text-stone-700">{{ artifact.author }}</span>
          <span class="text-[10px] text-stone-600 bg-stone-200/70 px-1.5 py-0.5 rounded-md font-medium">
            {{ artifact.authorRole }}
          </span>
        </div>
        <div class="flex items-center gap-1 text-[11px]">
          <Calendar class="w-3 h-3 text-stone-500" />
          <span>{{ artifact.date }}</span>
        </div>
      </div>

      <!-- The required "現実で話してみよう！" prompt -->
      <div class="mt-4 p-3 rounded-2xl bg-amber-50/90 border border-amber-200 flex items-start gap-2.5 text-amber-900">
        <MessageCircleHeart class="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div class="text-[11px] leading-snug">
          <span class="font-bold block text-amber-800">現実で話してみよう！</span>
          チャットで感想を送る代わりに、今日の夕ご飯や顔を合わせたときに「写真見たよ」「テストお疲れさま」と伝えてみませんか？
        </div>
      </div>

      <button
        @click="$emit('close')"
        class="w-full mt-4 py-2.5 rounded-2xl bg-stone-800 hover:bg-stone-900 text-white font-semibold text-xs transition-colors shadow-xs cursor-pointer"
      >
        閉じる
      </button>
    </div>
  </div>
</template>
