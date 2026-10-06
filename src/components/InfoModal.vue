<script setup lang="ts">
import { ref, watch } from 'vue';
import { X, ShieldCheck, Sparkles, MessageCircle, Link, Bell } from 'lucide-vue-next';
import { useModalA11y } from '../composables/useModalA11y';
import { isPushSupported, enablePush, isPushEnabled } from '../push';

const props = defineProps<{
  isOpen: boolean;
  familyName: string;
  inviteCode: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'toast', msg: string): void;
}>();

useModalA11y(() => props.isOpen, () => emit('close'));

const pushSupported = isPushSupported();
const pushOn = ref(false);
const pushBusy = ref(false);

// 開くたびに購読状態を確認するだけ。許可ダイアログはボタンを押すまで出さない
watch(() => props.isOpen, async (open) => {
  if (open && pushSupported) pushOn.value = await isPushEnabled();
});

const togglePush = async () => {
  if (pushOn.value || pushBusy.value) return;
  pushBusy.value = true;
  try {
    pushOn.value = await enablePush();
    if (!pushOn.value) emit('toast', '通知をオンにできませんでした');
  } catch {
    emit('toast', '通知をオンにできませんでした');
  } finally {
    pushBusy.value = false;
  }
};

const shareInvite = async () => {
  const url = `${location.origin}/?invite=${props.inviteCode}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'FamiTree', text: `${props.familyName}の木に参加しよう`, url });
    } else {
      await navigator.clipboard.writeText(url);
      emit('toast', '🔗 招待リンクをコピーしました');
    }
  } catch (e) {
    if ((e as DOMException).name !== 'AbortError') emit('toast', 'コピーできませんでした');
  }
};
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
        <div class="p-3 bg-white rounded-2xl border border-stone-200 text-stone-700">
          <span class="font-bold block text-stone-800">🏡 {{ familyName }}</span>
          <span class="block mt-1">招待コード</span>
          <span class="block font-mono text-base font-bold tracking-widest text-stone-800 select-all">{{ inviteCode }}</span>
          <button
            type="button"
            @click="shareInvite"
            class="mt-2 w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Link class="w-3.5 h-3.5" />
            <span>招待リンクをコピー</span>
          </button>

          <template v-if="pushSupported">
            <button
              type="button"
              @click="togglePush"
              :disabled="pushOn || pushBusy"
              class="mt-2 w-full py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              :class="pushOn ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100 cursor-pointer'"
            >
              <Bell class="w-3.5 h-3.5" />
              <span>{{ pushOn ? '家族からの通知はオンです' : '家族からの通知を受け取る' }}</span>
            </button>
          </template>
          <span class="block mt-1 text-[10px] text-stone-500">通知を受け取るには、iPhoneでは「ホーム画面に追加」したアプリで開く必要があります。</span>
        </div>

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
