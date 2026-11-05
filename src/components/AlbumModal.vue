<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { useModalA11y } from '../composables/useModalA11y';
import type { TreeArtifact } from '../types';

const props = defineProps<{
  isOpen: boolean;
  items: TreeArtifact[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'select', item: TreeArtifact): void;
}>();

useModalA11y(() => props.isOpen, () => emit('close'));
</script>

<template>
  <!-- 詳細モーダル (z-50) を上に重ねるため、アルバム自体は z-40 に留める -->
  <div
    v-if="isOpen"
    @click.self="$emit('close')"
    role="dialog"
    aria-modal="true"
    aria-labelledby="album-modal-title"
    class="fixed inset-0 z-40 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs"
  >
    <div
      class="bg-stone-50 rounded-2xl sm:rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-stone-200 text-stone-800 relative flex flex-col"
    >
      <div class="flex items-center justify-between pb-3 border-b border-stone-200">
        <h3 id="album-modal-title" class="font-bold text-sm text-stone-800">アルバム</h3>
        <button
          @click="$emit('close')"
          aria-label="閉じる"
          class="w-7 h-7 rounded-full bg-stone-200 flex items-center justify-center text-stone-600 hover:bg-stone-300 cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <p class="mt-2 text-[11px] text-stone-500">木から外れた思い出（30日間）</p>

      <div v-if="items.length" class="mt-3 grid grid-cols-3 gap-2 max-h-[70vh] overflow-y-auto">
        <button
          v-for="item in items"
          :key="item.id"
          @click="$emit('select', item)"
          class="text-left cursor-pointer group"
        >
          <div
            v-if="item.type === 'photo'"
            class="aspect-square rounded-xl overflow-hidden bg-stone-100 border border-stone-200"
          >
            <img
              :src="item.content"
              :alt="item.title"
              loading="lazy"
              referrerpolicy="no-referrer"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </div>
          <div
            v-else
            class="wood-grain aspect-square rounded-xl shadow-wooden border border-amber-900/40 text-amber-50 px-1.5 py-2 flex flex-col items-center justify-center text-center"
          >
            <div class="flex items-center justify-center gap-1">
              <span class="text-[11px] leading-none">{{ item.authorAvatar }}</span>
              <span class="text-[9px] font-bold text-amber-200 tracking-wider truncate">{{ item.author }}</span>
            </div>
            <p class="mt-1 text-[10px] font-medium leading-tight line-clamp-3 text-stone-100 drop-shadow-xs">
              {{ item.content }}
            </p>
          </div>
          <p class="mt-1 text-[10px] text-stone-500 truncate">{{ item.date }}・{{ item.author }}</p>
        </button>
      </div>

      <div v-else class="mt-6 mb-6 text-center">
        <span class="text-3xl block">🍃</span>
        <p class="mt-2 text-xs font-semibold text-stone-600">まだアルバムは空です</p>
        <p class="mt-1 text-[11px] text-stone-500 leading-relaxed">
          写真は木に1日ぶら下がったあと、ここに移ります。
        </p>
      </div>

      <p class="mt-3 pt-3 border-t border-stone-200 text-[10px] text-stone-400">
        30日を過ぎた写真とプレートは自動で消えます。
      </p>

      <button
        @click="$emit('close')"
        class="w-full mt-3 py-2.5 rounded-2xl bg-stone-800 text-white font-semibold text-xs hover:bg-stone-900 transition-colors cursor-pointer"
      >
        とじる
      </button>
    </div>
  </div>
</template>
