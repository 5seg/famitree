<script setup lang="ts">
import { computed } from 'vue';
import { Moon, Sun, Flower2 } from 'lucide-vue-next';
import type { TreeState, TreeArtifact } from '../types';

const props = defineProps<{
  treeState: TreeState;
  artifacts: TreeArtifact[];
  isWateringAnimation: boolean;
}>();

defineEmits<{
  (e: 'selectArtifact', artifact: TreeArtifact): void;
}>();

const stateThemes = {
  thriving: {
    canopyColor: '#10b981',
    secondaryCanopy: '#059669',
    trunkColor: '#78350f',
    auraColor: 'from-emerald-200/40 via-amber-100/20 to-transparent',
    statusText: '満開・元気いっぱい 🌸',
  },
  growing: {
    canopyColor: '#34d399',
    secondaryCanopy: '#10b981',
    trunkColor: '#854d0e',
    auraColor: 'from-emerald-100/30 via-stone-100/10 to-transparent',
    statusText: 'すくすく成長中 🌱',
  },
  wilting: {
    canopyColor: '#ca8a04',
    secondaryCanopy: '#a16207',
    trunkColor: '#713f12',
    auraColor: 'from-amber-100/20 via-stone-200/20 to-transparent',
    statusText: 'のどが渇いています 🍂',
  },
  hibernating: {
    canopyColor: '#a8a29e',
    secondaryCanopy: '#78716c',
    trunkColor: '#57534e',
    auraColor: 'from-blue-100/20 via-stone-100/20 to-transparent',
    statusText: '冬の休息中 💤',
  },
};

const currentTheme = computed(() => stateThemes[props.treeState]);

// アーティファクトを吊るす領域（キャンバス 340px に対する割合）
const CANVAS_SIZE = 340;
const HANG_AREA = { left: 0.1, right: 0.9, top: 0.16, bottom: 0.8 };
// 吊り紐を含めた写真1枚の縦横比（高さ ÷ 幅）
const CARD_ASPECT = 1.3;

type PlacedArtifact = {
  artifact: TreeArtifact;
  left: number;
  top: number;
  width: number;
  rotate: number;
  compact: boolean; // 小さいカードではキャプションを省いて写真だけ見せる
};

// 保存された座標は使わず、枚数から升目を決めて並べる。
// ランダム配置のままだと写真が増えたときに重なって隠れてしまうため
const placedArtifacts = computed<PlacedArtifact[]>(() => {
  const items = [...props.artifacts].reverse(); // 古い順に描き、新しいものほど手前に来るようにする
  if (items.length === 0) return [];

  const areaW = CANVAS_SIZE * (HANG_AREA.right - HANG_AREA.left);
  const areaH = CANVAS_SIZE * (HANG_AREA.bottom - HANG_AREA.top);

  // 写真が一番大きく写る分割（列数）を選ぶ
  let cols = 1;
  let cardW = 0;
  for (let c = 1; c <= items.length; c++) {
    const rows = Math.ceil(items.length / c);
    const w = Math.min((areaW / c) * 0.92, (areaH / rows / CARD_ASPECT) * 0.92);
    if (w > cardW) {
      cardW = w;
      cols = c;
    }
  }
  cardW = Math.min(cardW, 92); // 元の写真サイズより大きくしない

  const rows = Math.ceil(items.length / cols);
  const cellW = areaW / cols;
  const cellH = areaH / rows;
  const lastRowCount = items.length - (rows - 1) * cols;

  return items.map((artifact, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    // 最終行が埋まらないときは中央に寄せる
    const offset = row === rows - 1 ? (cols - lastRowCount) / 2 : 0;
    // 升目っぽさを消すための、保存座標から作る小さな揺らぎ
    const jitterX = (((artifact.coords.x % 4) + 4) % 4 - 1.5) * cellW * 0.03;
    const jitterY = (((artifact.coords.y % 3) + 3) % 3 - 1) * cellH * 0.02;
    const x = CANVAS_SIZE * HANG_AREA.left + cellW * (col + offset + 0.5) + jitterX;
    const y = CANVAS_SIZE * HANG_AREA.top + cellH * (row + 0.5) + jitterY;

    // 木札は文字が入るぶん広めに。ただし升目からははみ出さない
    const width =
      artifact.type === 'wood'
        ? Math.min(cellW * 0.96, Math.max(76, cardW * 1.15))
        : cardW;

    return {
      artifact,
      left: (x / CANVAS_SIZE) * 100,
      top: (y / CANVAS_SIZE) * 100,
      width,
      rotate: Math.max(-4, Math.min(4, artifact.coords.rotate * 0.7)),
      compact: width < 72,
    };
  });
});
</script>

<template>
  <div class="relative w-full h-[370px] flex items-center justify-center overflow-hidden select-none">
    <!-- Ambient background glow / aura -->
    <div
      class="absolute inset-0 bg-radial pointer-events-none transition-all duration-1000"
      :class="currentTheme.auraColor"
    />

    <!-- Floating Weather/Mood Indicators -->
    <div class="absolute top-2 left-4 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-stone-50/80 backdrop-blur-xs border border-stone-200/60 shadow-xs text-[11px] text-stone-600 font-medium">
      <Flower2 v-if="treeState === 'thriving'" class="w-3.5 h-3.5 text-pink-500 animate-spin" style="animation-duration: 8s;" />
      <Sun v-else-if="treeState === 'growing'" class="w-3.5 h-3.5 text-amber-500" />
      <span v-else-if="treeState === 'wilting'" class="text-xs">🍂</span>
      <Moon v-else-if="treeState === 'hibernating'" class="w-3.5 h-3.5 text-blue-400" />
      <span>{{ currentTheme.statusText }}</span>
    </div>

    <!-- Hibernating sleep animation badge -->
    <div
      v-if="treeState === 'hibernating'"
      class="absolute top-16 right-16 z-10 text-stone-500 font-mono font-bold text-lg pointer-events-none animate-bounce"
    >
      Zzz...
    </div>

    <!-- Thriving Sparkling particles -->
    <template v-if="treeState === 'thriving'">
      <div class="absolute top-12 left-14 text-pink-400 pointer-events-none animate-pulse">🌸</div>
      <div class="absolute top-16 right-12 text-amber-400 pointer-events-none animate-pulse">✨</div>
      <div class="absolute top-28 right-24 text-emerald-400 pointer-events-none animate-pulse">🌿</div>
    </template>

    <!-- The Illustrated Tree Canvas -->
    <div
      class="relative w-[340px] h-[340px] flex items-center justify-center transition-transform duration-700"
      :class="{ 'scale-105 rotate-1': isWateringAnimation }"
    >
      <svg
        viewBox="0 0 340 340"
        class="w-full h-full drop-shadow-md overflow-visible"
      >
        <defs>
          <linearGradient id="trunkGradVue" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#5c2e0b" />
            <stop offset="50%" :stop-color="currentTheme.trunkColor" />
            <stop offset="100%" stop-color="#452207" />
          </linearGradient>

          <radialGradient id="foliageGradVue" cx="40%" cy="40%" r="60%">
            <stop offset="0%" :stop-color="currentTheme.canopyColor" />
            <stop offset="100%" :stop-color="currentTheme.secondaryCanopy" />
          </radialGradient>

          <filter id="gentleShadowVue" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="4" stdDeviation="3" flood-opacity="0.12" />
          </filter>
        </defs>

        <!-- Gentle Hill / Ground Soil -->
        <path
          d="M 20 310 Q 170 280 320 310 L 320 330 L 20 330 Z"
          fill="#e7e5e4"
          class="transition-colors duration-700"
        />
        <path
          d="M 60 312 Q 170 290 280 312 L 280 320 L 60 320 Z"
          fill="#d6d3d1"
        />

        <!-- Roots -->
        <path
          d="M 145 295 Q 120 305 100 310 M 195 295 Q 220 305 240 310 M 170 300 L 170 315"
          :stroke="currentTheme.trunkColor"
          stroke-width="5"
          stroke-linecap="round"
          fill="none"
        />

        <!-- Tree Trunk & Organic Branches -->
        <path
          d="M 152 300 Q 155 240 148 200 Q 140 160 120 130 M 148 200 Q 170 170 190 140 M 188 300 Q 185 240 192 200 Q 200 160 220 130"
          stroke="url(#trunkGradVue)"
          stroke-width="20"
          stroke-linecap="round"
          fill="none"
          filter="url(#gentleShadowVue)"
        />
        <!-- Main Trunk Body -->
        <path
          d="M 148 300 C 150 250, 150 200, 155 170 C 160 140, 160 120, 170 100 C 180 120, 180 140, 185 170 C 190 200, 190 250, 192 300 Z"
          fill="url(#trunkGradVue)"
        />

        <!-- Wooden texture knothole -->
        <ellipse cx="170" cy="225" rx="3.5" ry="5.5" fill="#452207" opacity="0.6" />

        <!-- Foliage Canopy Clusters -->
        <g v-if="treeState !== 'hibernating'" filter="url(#gentleShadowVue)">
          <circle cx="120" cy="115" r="48" fill="url(#foliageGradVue)" opacity="0.9" />
          <circle cx="220" cy="115" r="48" fill="url(#foliageGradVue)" opacity="0.9" />
          <circle cx="170" cy="85" r="55" fill="url(#foliageGradVue)" opacity="0.9" />

          <circle cx="105" cy="140" r="42" fill="url(#foliageGradVue)" />
          <circle cx="235" cy="140" r="42" fill="url(#foliageGradVue)" />
          <circle cx="140" cy="130" r="45" fill="url(#foliageGradVue)" />
          <circle cx="200" cy="130" r="45" fill="url(#foliageGradVue)" />
          <circle cx="170" cy="110" r="50" fill="url(#foliageGradVue)" />

          <circle v-if="treeState === 'wilting'" cx="170" cy="145" r="38" fill="#eab308" opacity="0.75" />
        </g>

        <!-- Fruit decorations when Thriving -->
        <g v-if="treeState === 'thriving'" class="animate-pulse">
          <circle cx="130" cy="95" r="5" fill="#f43f5e" />
          <circle cx="210" cy="100" r="5" fill="#f43f5e" />
          <circle cx="165" cy="65" r="5.5" fill="#f43f5e" />
          <circle cx="185" cy="135" r="4.5" fill="#f43f5e" />
        </g>
      </svg>

      <!-- Hanging Artifacts -->
      <div class="absolute inset-0 pointer-events-auto">
        <div
          v-for="item in placedArtifacts"
          :key="item.artifact.id"
          :style="{
            left: `${item.left}%`,
            top: `${item.top}%`,
            width: `${item.width}px`,
            fontSize: `${item.width / 10}px`,
            rotate: `${item.rotate}deg`,
            translate: '-50% -50%',
          }"
          @click="$emit('selectArtifact', item.artifact)"
          class="absolute z-20 group cursor-pointer hover:z-40 hover:scale-110 active:scale-95 transition-all duration-200"
        >
          <!-- Hanging string -->
          <div class="w-[0.2em] min-w-px h-[2.6em] bg-stone-400/80 mx-auto -mb-[0.15em] shadow-xs group-hover:bg-amber-600 transition-colors" />

          <!-- Polaroid Photo -->
          <div
            v-if="item.artifact.type === 'photo'"
            class="bg-white p-[0.12em] pb-[0.3em] rounded-xs shadow-polaroid border border-stone-200/90 text-center"
          >
            <div class="w-full h-[8em] bg-stone-100 overflow-hidden rounded-[0.15em] relative">
              <img
                :src="item.artifact.content"
                :alt="item.artifact.title"
                referrerpolicy="no-referrer"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
              <span
                v-if="!item.compact"
                class="absolute top-[0.15em] left-[0.15em] text-[0.95em] leading-none bg-white/90 rounded-full px-[0.2em] py-[0.05em] shadow-xs"
              >
                {{ item.artifact.authorAvatar }}
              </span>
            </div>
            <p
              v-if="!item.compact"
              class="mt-[0.2em] text-[1em] leading-tight font-medium text-stone-700 truncate px-[0.1em]"
            >
              {{ item.artifact.title }}
            </p>
          </div>

          <!-- Wood Carved Plaque -->
          <div
            v-else
            class="wood-grain px-[0.3em] py-[0.25em] rounded-lg shadow-wooden border border-amber-900/40 text-amber-50 text-center"
            :style="{ fontSize: `${Math.max(8, item.width / 10)}px` }"
          >
            <div class="flex items-center justify-center gap-[0.2em] mb-[0.1em]">
              <span class="text-[1em]">{{ item.artifact.authorAvatar }}</span>
              <span class="text-[0.95em] font-bold text-amber-200 tracking-wider">
                {{ item.artifact.author }}
              </span>
            </div>
            <p class="text-[1em] font-medium leading-tight line-clamp-2 text-stone-100 drop-shadow-xs">
              {{ item.artifact.content }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Watering ripple overlay -->
    <div
      v-if="isWateringAnimation"
      class="absolute inset-0 flex items-center justify-center pointer-events-none z-30 transition-all duration-700 animate-ping"
    >
      <span class="text-6xl">💧</span>
    </div>
  </div>
</template>
