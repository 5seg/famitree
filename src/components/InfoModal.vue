<script setup lang="ts">
import { X, ShieldCheck, Sparkles, MessageCircle } from 'lucide-vue-next';
import { useModalA11y } from '../composables/useModalA11y';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

useModalA11y(() => props.isOpen, () => emit('close'));
</script>

<template>
  <div
    v-if="isOpen"
    @click.self="$emit('close')"
    role="dialog"
    aria-modal="true"
    aria-labelledby="info-modal-title"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs"
  >
    <div
      class="bg-stone-50 rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-stone-200 text-stone-800 relative max-h-[85vh] overflow-y-auto"
    >
      <div class="flex items-center justify-between pb-3 border-b border-stone-200">
        <div class="flex items-center gap-2">
          <span class="text-xl">🌳</span>
          <h3 id="info-modal-title" class="font-bold text-sm text-stone-800">FamiTree（ファミツリー）について</h3>
        </div>
        <button
          @click="$emit('close')"
          aria-label="閉じる"
          class="w-7 h-7 rounded-full bg-stone-200 flex items-center justify-center text-stone-600 hover:bg-stone-300 cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="mt-3 space-y-3 text-xs leading-relaxed text-stone-600">
        <div class="p-3 bg-emerald-50 rounded-2xl border border-emerald-200/80 text-emerald-900">
          <span class="font-bold block mb-1 flex items-center gap-1.5">
            <Sparkles class="w-4 h-4 text-emerald-600" />
            アンビエント・ウェルネス設計
          </span>
          監視GPSや義務感のあるチャット通知ではなく、1日1回「木に水をあげる」だけで家族の気配と安心を分かち合えます。
        </div>

        <div class="p-3 bg-amber-50 rounded-2xl border border-amber-200/80 text-amber-900">
          <span class="font-bold block mb-1 flex items-center gap-1.5">
            <MessageCircle class="w-4 h-4 text-amber-600" />
            木がみんなの共有キャンバス
          </span>
          写真はポラロイドのように枝にぶら下がり、言葉は木製のプレートに刻まれます。リアルでの「話すきっかけ」を生み出す設計です。
        </div>

        <div class="p-3 bg-stone-100 rounded-2xl border border-stone-200 text-stone-700">
          <span class="font-bold block mb-1 flex items-center gap-1.5">
            <ShieldCheck class="w-4 h-4 text-stone-600" />
            ADHD & 家族に優しいロープレッシャー
          </span>
          分単位のタイムスタンプや未読プレッシャーはありません。疲れている日も、ワンタップで「今日も生きてるよ」と伝わります。
        </div>
      </div>

      <button
        @click="$emit('close')"
        class="w-full mt-4 py-2.5 rounded-2xl bg-stone-800 text-white font-semibold text-xs hover:bg-stone-900 transition-colors cursor-pointer"
      >
        とじる
      </button>
    </div>
  </div>
</template>
