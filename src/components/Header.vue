<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Sparkles, Flame, Info, ChevronDown, ArrowLeftRight, LogOut } from 'lucide-vue-next';

defineProps<{
  familyName: string;
  memberCount: number;
  streak: number;
  treeLevel: number;
  expPercent: number;
}>();

const emit = defineEmits<{
  (e: 'openInfo'): void;
  (e: 'switchFamily'): void;
  (e: 'leaveFamily'): void;
}>();

const open = ref(false);
const wrapper = ref<HTMLElement | null>(null);

// メニューの外を押しても閉じたいが、ボタン自身のクリックで開閉が壊れないよう wrapper 内は除外する
const closeOnOutsidePointerDown = (event: PointerEvent) => {
  if (event.target instanceof Node && wrapper.value?.contains(event.target)) return;
  open.value = false;
};
const closeOnEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape') open.value = false;
};

onMounted(() => {
  document.addEventListener('pointerdown', closeOnOutsidePointerDown);
  window.addEventListener('keydown', closeOnEscape);
});
onUnmounted(() => {
  document.removeEventListener('pointerdown', closeOnOutsidePointerDown);
  window.removeEventListener('keydown', closeOnEscape);
});

const chooseSwitchFamily = () => {
  open.value = false;
  emit('switchFamily');
};
const chooseLeaveFamily = () => {
  open.value = false;
  emit('leaveFamily');
};
</script>

<template>
  <header class="px-4 pt-4 pb-2 bg-gradient-to-b from-stone-50/90 to-transparent sticky top-0 z-20 backdrop-blur-xs">
    <div class="flex items-center justify-between">
      <!-- Family Group Title -->
      <div ref="wrapper" class="relative">
        <button
          @click="open = !open"
          aria-haspopup="menu"
          :aria-expanded="open"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-amber-50/90 border border-amber-200/80 shadow-xs hover:bg-amber-100/80 transition-all text-left group cursor-pointer"
        >
          <span class="text-lg">🏡</span>
          <div>
            <div class="flex items-center gap-1">
              <span class="text-xs font-bold text-stone-800 tracking-tight">{{ familyName }}の木</span>
              <ChevronDown
                class="w-3.5 h-3.5 text-stone-500 group-hover:translate-y-0.5 transition-transform"
                :class="{ 'rotate-180': open }"
              />
            </div>
            <span class="text-[10px] text-stone-500">{{ memberCount }}人の庭</span>
          </div>
        </button>

        <div
          v-if="open"
          role="menu"
          class="absolute left-0 top-full mt-1.5 z-30 w-56 rounded-2xl bg-white border border-stone-200 shadow-xl p-1.5"
        >
          <button
            role="menuitem"
            @click="chooseSwitchFamily"
            class="w-full text-left px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 hover:bg-stone-100 cursor-pointer"
          >
            <ArrowLeftRight class="w-3.5 h-3.5 text-stone-600" />
            家族を切り替え
          </button>
          <button
            role="menuitem"
            @click="chooseLeaveFamily"
            class="w-full text-left px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 hover:bg-stone-100 cursor-pointer text-rose-600"
          >
            <LogOut class="w-3.5 h-3.5 text-rose-600" />
            家族から抜ける
          </button>
        </div>
      </div>

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
