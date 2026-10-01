<script setup lang="ts">
import { ref } from 'vue';
import { X, Camera, PenTool, Check } from 'lucide-vue-next';
import { useModalA11y } from '../composables/useModalA11y';
import type { TreeArtifact, FamilyMember } from '../types';

const props = defineProps<{
  isOpen: boolean;
  treeLevel: number;
  currentUser?: FamilyMember;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'addArtifact', artifact: Omit<TreeArtifact, 'id' | 'date' | 'coords'>): void;
}>();

useModalA11y(() => props.isOpen, () => emit('close'));

const PRESET_IMAGES = [
  { label: 'お弁当 🍱', url: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=600&q=80' },
  { label: '青空 🌤️', url: 'https://images.unsplash.com/photo-1534088568595-a066f410bcda?auto=format&fit=crop&w=600&q=80' },
  { label: '夕焼け 🌇', url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80' },
  { label: 'お散歩の道 🍃', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=600&q=80' },
];

const activeTab = ref<'photo' | 'wood'>('photo');
const selectedImage = ref(PRESET_IMAGES[0].url);
const caption = ref('今日のみつけたもの');
const woodText = ref('今日も一日お疲れさま！');

const handleSubmit = () => {
  const authorName = props.currentUser?.name || '自分';
  const authorAvatar = props.currentUser?.avatar || '👦';
  const authorRole = props.currentUser?.role || '高校生';

  if (activeTab.value === 'photo') {
    emit('addArtifact', {
      type: 'photo',
      author: authorName,
      authorAvatar: authorAvatar,
      authorRole: authorRole,
      title: caption.value.trim() || '日常のひとこま',
      content: selectedImage.value,
    });
  } else {
    if (!woodText.value.trim()) return;
    emit('addArtifact', {
      type: 'wood',
      author: authorName,
      authorAvatar: authorAvatar,
      authorRole: authorRole,
      title: '木製プレート',
      content: woodText.value.slice(0, 20),
    });
  }
  emit('close');
};
</script>

<template>
  <div
    v-if="isOpen"
    @click.self="$emit('close')"
    role="dialog"
    aria-modal="true"
    aria-labelledby="add-content-title"
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-stone-900/50 backdrop-blur-xs"
  >
    <div
      class="bg-stone-50 rounded-t-3xl sm:rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-stone-200 text-stone-800 relative max-h-[90vh] overflow-y-auto"
    >
      <!-- Header -->
      <div class="flex items-center justify-between pb-3 border-b border-stone-200">
        <div class="flex items-center gap-2">
          <span class="text-xl">🌿</span>
          <h3 id="add-content-title" class="font-bold text-sm text-stone-800">木に思い出を残す</h3>
        </div>
        <button
          @click="$emit('close')"
          aria-label="閉じる"
          class="w-7 h-7 rounded-full bg-stone-200/70 flex items-center justify-center text-stone-600 hover:bg-stone-300 transition-colors cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Level Unlock Status Banner -->
      <div class="mt-3 px-3 py-2 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center gap-2 text-[11px] text-amber-900">
        <span class="text-xs">✨</span>
        <span class="font-medium">
          Lv.{{ treeLevel }}：Lv.2で写真解放済み / <span class="text-amber-700">Lv.5で鳥の巣が解放！</span>
        </span>
      </div>

      <!-- Tab Selection -->
      <div class="flex bg-stone-200/70 p-1 rounded-2xl mt-3">
        <button
          @click="activeTab = 'photo'"
          class="flex-1 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          :class="activeTab === 'photo' ? 'bg-white text-stone-800 shadow-xs' : 'text-stone-500 hover:text-stone-700'"
        >
          <Camera class="w-3.5 h-3.5" />
          <span>写真をぶら下げる</span>
        </button>
        <button
          @click="activeTab = 'wood'"
          class="flex-1 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          :class="activeTab === 'wood' ? 'bg-white text-stone-800 shadow-xs' : 'text-stone-500 hover:text-stone-700'"
        >
          <PenTool class="w-3.5 h-3.5" />
          <span>文字を刻む</span>
        </button>
      </div>

      <!-- Form Body -->
      <form @submit.prevent="handleSubmit" class="mt-4 flex flex-col gap-4">
        <div v-if="activeTab === 'photo'">
          <label class="block text-xs font-semibold text-stone-700 mb-1.5">
            ぶら下げる写真を選ぶ（モック）:
          </label>
          <div class="grid grid-cols-4 gap-2 mb-3">
            <button
              v-for="(img, idx) in PRESET_IMAGES"
              :key="idx"
              type="button"
              @click="selectedImage = img.url"
              class="relative rounded-xl overflow-hidden aspect-square border-2 transition-all cursor-pointer"
              :class="selectedImage === img.url ? 'border-emerald-500 ring-2 ring-emerald-300' : 'border-transparent opacity-75 hover:opacity-100'"
            >
              <img :src="img.url" :alt="img.label" loading="lazy" class="w-full h-full object-cover" />
              <div
                v-if="selectedImage === img.url"
                class="absolute inset-0 bg-emerald-900/30 flex items-center justify-center"
              >
                <Check class="w-4 h-4 text-white" />
              </div>
            </button>
          </div>

          <!-- Caption input -->
          <label class="block text-xs font-semibold text-stone-700 mb-1">
            写真のタイトル・一言:
          </label>
          <input
            type="text"
            v-model="caption"
            maxlength="24"
            class="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 text-xs focus:outline-emerald-500"
            placeholder="例: 夕暮れの空、今日のお弁当"
          />

          <!-- Polaroid preview -->
          <div class="mt-3 flex flex-col items-center">
            <span class="text-[10px] text-stone-600 mb-1">木にかかるイメージ</span>
            <div class="bg-white p-2 pb-3 rounded-xs shadow-polaroid border border-stone-200 w-28 text-center rotate-1">
              <img :src="selectedImage" alt="preview" class="w-full h-20 object-cover rounded-2xs" />
              <p class="mt-1 text-[10px] font-medium text-stone-700 truncate">
                {{ caption || 'タイトル' }}
              </p>
            </div>
          </div>
        </div>

        <div v-else>
          <!-- Wooden plate text tab -->
          <div class="flex items-center justify-between mb-1">
            <label class="block text-xs font-semibold text-stone-700">
              木のプレートに刻む言葉（最大20文字）:
            </label>
            <span class="text-[10px] font-mono" :class="woodText.length >= 20 ? 'text-rose-500 font-bold' : 'text-stone-500'">
              {{ woodText.length }}/20
            </span>
          </div>
          <input
            type="text"
            v-model="woodText"
            maxlength="20"
            class="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 text-xs focus:outline-emerald-500"
            placeholder="例: テスト終わった！"
          />

          <!-- Wooden Style Live Preview -->
          <div class="mt-4 flex flex-col items-center">
            <span class="text-[10px] text-stone-600 mb-1">リアルタイム木製プレートプレビュー</span>
            <div class="wood-grain px-4 py-2.5 rounded-xl shadow-wooden border border-amber-900/50 text-amber-50 min-w-44 text-center">
              <div class="flex items-center justify-center gap-1 mb-0.5">
                <span class="text-xs">{{ currentUser?.avatar || '👦' }}</span>
                <span class="text-[10px] font-bold text-amber-200 tracking-wider">
                  {{ currentUser?.name || '自分' }}
                </span>
              </div>
              <p class="text-xs font-bold text-stone-100 drop-shadow-xs">
                {{ woodText || '（文字を入力してください）' }}
              </p>
            </div>
          </div>
        </div>

        <!-- Submit Button -->
        <button
          type="submit"
          class="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors mt-2 cursor-pointer"
        >
          木に吊るす 🌿
        </button>
      </form>
    </div>
  </div>
</template>
