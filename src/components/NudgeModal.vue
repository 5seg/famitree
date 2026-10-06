<script setup lang="ts">
import { ref, watch } from 'vue';
import { X, Send, CheckCircle2 } from 'lucide-vue-next';
import { useModalA11y } from '../composables/useModalA11y';
import { sendNudge } from '../api';
import { describeError } from '../session';
import type { FamilyMember } from '../types';

const props = defineProps<{
  isOpen: boolean;
  unwateredMembers: FamilyMember[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

useModalA11y(() => props.isOpen, () => emit('close'));

const NUDGE_MESSAGES = [
  '「木がちょっぴり喉を乾かしているよ〜🌱」',
  '「今日の水やりまだなら一緒にどう？💧」',
  '「無理しないでね！元気にしてるかな？🍵」',
];

const selectedMessage = ref(NUDGE_MESSAGES[0]);
const isSent = ref(false);
const sending = ref(false);
const note = ref('');
const error = ref('');

watch(() => props.isOpen, (val) => {
  if (val) {
    isSent.value = false;
    note.value = error.value = '';
    selectedMessage.value = NUDGE_MESSAGES[0];
  }
});

const handleSend = async () => {
  if (sending.value || !props.unwateredMembers.length) return;
  sending.value = true;
  error.value = '';
  try {
    const msg = selectedMessage.value.replace(/[「」]/g, '');
    const { sent } = await sendNudge(props.unwateredMembers.map((m) => m.id), 'nudge', msg);
    if (sent === 0) {
      note.value = '今日はもう届いています';
      return;
    }
    isSent.value = true;
    setTimeout(() => {
      isSent.value = false;
      emit('close');
    }, 1800);
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
    aria-labelledby="nudge-title"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs"
  >
    <div
      class="bg-white rounded-3xl p-5 max-w-xs w-full shadow-2xl border border-stone-200 text-stone-800 relative"
    >
      <div class="flex items-center justify-between pb-2 border-b border-stone-100">
        <div class="flex items-center gap-2">
          <span class="text-lg">🌱</span>
          <h3 id="nudge-title" class="font-bold text-sm text-stone-800">家族に水やりを促す</h3>
        </div>
        <button
          @click="$emit('close')"
          aria-label="閉じる"
          class="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 hover:bg-stone-200 cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div v-if="isSent" class="py-8 text-center">
        <div class="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2">
          <CheckCircle2 class="w-6 h-6" />
        </div>
        <p class="text-xs font-bold text-stone-800">やさしい合図を送りました！</p>
        <p class="text-[11px] text-stone-600 mt-1">催促ではなく、あたたかい通知です</p>
      </div>

      <div v-else class="mt-3 flex flex-col gap-3">
        <p class="text-[11px] text-stone-600 leading-relaxed">
          プレッシャーを与えない、やさしい木の合図を家族にお届けします。
        </p>

        <!-- Target members -->
        <div>
          <span class="text-[11px] font-semibold text-stone-700 block mb-1">
            まだ水やりをしていない家族:
          </span>
          <div class="flex items-center gap-1.5 flex-wrap">
            <template v-if="unwateredMembers.length > 0">
              <span
                v-for="m in unwateredMembers"
                :key="m.id"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-[11px] text-stone-700 font-medium"
              >
                <span>{{ m.avatar }}</span>
                <span>{{ m.name }}</span>
              </span>
            </template>
            <span v-else class="text-[11px] text-emerald-600 font-semibold">
              ✨ 全員水やり完了しています！
            </span>
          </div>
        </div>

        <!-- Message selection -->
        <div>
          <span class="text-[11px] font-semibold text-stone-700 block mb-1.5">
            送るメッセージの雰囲気:
          </span>
          <div class="space-y-1.5">
            <button
              v-for="(msg, i) in NUDGE_MESSAGES"
              :key="i"
              @click="selectedMessage = msg"
              class="w-full text-left p-2 rounded-xl text-xs transition-all border cursor-pointer"
              :class="selectedMessage === msg ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-medium' : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'"
            >
              {{ msg }}
            </button>
          </div>
        </div>

        <p v-if="note" class="text-[11px] text-stone-600 text-center">{{ note }}</p>
        <p v-if="error" role="alert" class="text-[11px] text-rose-600 font-semibold text-center">{{ error }}</p>

        <button
          @click="handleSend"
          :disabled="sending || !unwateredMembers.length"
          class="mt-1 w-full py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
        >
          <Send class="w-3.5 h-3.5" />
          <span>ふんわり合図を送る</span>
        </button>
      </div>
    </div>
  </div>
</template>
