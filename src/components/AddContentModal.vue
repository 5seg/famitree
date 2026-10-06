<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { X, Camera, PenTool, ImagePlus } from 'lucide-vue-next';
import { useModalA11y } from '../composables/useModalA11y';
import { addPhoto, addWood, type AppState } from '../api';
import { describeError } from '../session';
import type { TreeArtifact, FamilyMember } from '../types';

const props = defineProps<{
  isOpen: boolean;
  treeLevel: number;
  currentUser?: FamilyMember;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved', state: AppState, type: TreeArtifact['type']): void;
}>();

useModalA11y(() => props.isOpen, () => emit('close'));

const MAX_SIDE = 1600;

// 長辺 1600px 以下の JPEG に縮小（EXIF の向きは反映済み）
async function downscale(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // 透過PNG等は白背景にしてからJPEG化
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.85)
  );
}

const activeTab = ref<'photo' | 'wood'>('photo');
const photo = ref<Blob | null>(null);
const previewUrl = ref('');
const caption = ref('今日のみつけたもの');
const woodText = ref('今日も一日お疲れさま！');
const sending = ref(false);
const error = ref('');

const setPreview = (url: string) => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = url;
};
onUnmounted(() => setPreview(''));

watch(() => props.isOpen, (open) => {
  if (open) {
    error.value = '';
    photo.value = null;
    setPreview('');
  }
});

const onFile = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  error.value = '';
  try {
    photo.value = await downscale(file);
    setPreview(URL.createObjectURL(photo.value));
  } catch {
    photo.value = null;
    setPreview('');
    error.value = 'この画像は読み込めませんでした';
  }
};

const handleSubmit = async () => {
  if (sending.value) return;
  const isPhoto = activeTab.value === 'photo';
  if (isPhoto ? !photo.value : !woodText.value.trim()) return;
  sending.value = true;
  error.value = '';
  try {
    const state = isPhoto
      ? await addPhoto(photo.value!, caption.value.trim())
      : await addWood(woodText.value.trim());
    emit('saved', state, isPhoto ? 'photo' : 'wood');
    emit('close');
  } catch (e) {
    error.value = describeError(e);
  } finally {
    sending.value = false;
  }
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
            ぶら下げる写真を選ぶ:
          </label>
          <label
            class="mb-3 flex items-center justify-center gap-1.5 py-3 rounded-2xl border-2 border-dashed border-stone-300 bg-white text-xs font-semibold text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <ImagePlus class="w-4 h-4" />
            <span>{{ photo ? '別の写真を選ぶ' : '写真を選ぶ・撮る' }}</span>
            <input type="file" accept="image/*" class="sr-only" @change="onFile" />
          </label>

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
          <div v-if="previewUrl" class="mt-3 flex flex-col items-center">
            <span class="text-[10px] text-stone-600 mb-1">木にかかるイメージ</span>
            <div class="bg-white p-2 pb-3 rounded-xs shadow-polaroid border border-stone-200 w-28 text-center rotate-1">
              <img :src="previewUrl" alt="preview" class="w-full h-20 object-cover rounded-2xs" />
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

        <p v-if="error" role="alert" class="text-[11px] text-rose-600 font-semibold">{{ error }}</p>

        <!-- Submit Button -->
        <button
          type="submit"
          :disabled="sending || (activeTab === 'photo' && !photo)"
          class="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs shadow-md transition-colors mt-2 cursor-pointer"
        >
          {{ sending ? '送信中…' : '木に吊るす 🌿' }}
        </button>
      </form>
    </div>
  </div>
</template>
