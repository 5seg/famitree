<script setup lang="ts">
import { ref, computed } from 'vue';
import { createFamily, joinFamily, recoverSession, recoverFamily } from '../api';
import { describeError } from '../session';

const emit = defineEmits<{ (e: 'joined'): void }>();

const AVATARS = ['👦', '👧', '👨‍💼', '👩‍🍳', '👴', '👵', '🧑'];

// ?invite=CODE で来たら参加モードで開く。読んだらURLから消す
const invite = new URLSearchParams(location.search).get('invite');
if (invite) history.replaceState(null, '', location.pathname);

// create/join: はじめて。recover: 端末を失くした本人。family: 管理者が家族の緊急用キーで戻る
type Mode = 'create' | 'join' | 'recover' | 'family';
const mode = ref<Mode>(invite ? 'join' : 'create');
const familyName = ref('');
const inviteCode = ref((invite ?? '').trim().toUpperCase().slice(0, 8));
const recoveryCode = ref('');
const name = ref('');
const role = ref('');
const avatar = ref(AVATARS[0]);
const error = ref('');
const sending = ref(false);

// 参加が済んだ直後に一度だけ見せる復旧コード。閉じたら参加画面へ進む
const issued = ref<{ code: string; familyKey?: string } | null>(null);
const copied = ref('');

const isRecovery = computed(() => mode.value === 'recover' || mode.value === 'family');
const needsProfile = computed(() => mode.value !== 'recover');
const submitLabel = computed(
  () =>
    ({
      create: '木を植える 🌱',
      join: '家族の木に参加する 🌿',
      recover: '同じメンバーとして戻る 🔑',
      family: '管理者として入り直す 🔑',
    })[mode.value],
);

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = text;
  } catch {
    copied.value = ''; // コピーできない環境では選択して手で控えてもらう
  }
};

const submit = async () => {
  if (sending.value) return;
  sending.value = true;
  error.value = '';
  const profile = { name: name.value.trim(), role: role.value.trim(), avatar: avatar.value };
  try {
    if (mode.value === 'create') {
      issued.value = { code: await createFamily(familyName.value.trim(), profile) };
    } else if (mode.value === 'join') {
      issued.value = { code: await joinFamily(inviteCode.value.trim().toUpperCase(), profile) };
    } else if (mode.value === 'recover') {
      // 既存のメンバーとして戻るので、名前やアバターの入力はいらない
      await recoverSession(recoveryCode.value.trim());
      emit('joined');
      return;
    } else {
      const r = await recoverFamily(recoveryCode.value.trim(), profile);
      issued.value = { code: r.recoveryCode, familyKey: r.familyKey };
    }
    // コードが空（旧 API）なら、見せるものが無いのでそのまま進む
    if (!issued.value?.code) emit('joined');
  } catch (e) {
    error.value = describeError(e);
  } finally {
    sending.value = false;
  }
};

const input = 'w-full px-3 py-2 rounded-xl bg-white border border-stone-200 text-xs focus:outline-emerald-500';
const codeInput = [input, 'font-mono tracking-widest uppercase'];
const linkButton = 'text-[11px] font-semibold text-stone-500 hover:text-emerald-700 underline underline-offset-2 cursor-pointer';
</script>

<template>
  <div class="flex-1 flex flex-col justify-center p-6 overflow-y-auto">
    <!-- 参加直後: 復旧コードはここでしか出せないので、メモしてもらうまで見せる -->
    <template v-if="issued">
      <div class="text-center mb-3">
        <div class="text-4xl mb-1">🔑</div>
        <h1 class="font-bold text-base text-stone-800">復旧コード</h1>
        <p class="text-[11px] text-stone-600 mt-1">
          端末を失くしたときに、このコードで同じメンバーとして戻れます。
        </p>
      </div>

      <div class="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-center">
        <span class="block text-[10px] font-semibold text-amber-800">あなたのコード（この画面でしか出ません）</span>
        <span class="block mt-1 font-mono text-base font-bold tracking-[0.15em] text-stone-800 select-all break-all">
          {{ issued.code }}
        </span>
        <button
          type="button"
          @click="copy(issued.code)"
          class="mt-2 w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer"
        >
          {{ copied === issued.code ? 'コピーしました ✓' : 'コピー' }}
        </button>
      </div>

      <div v-if="issued.familyKey" class="mt-3 p-4 bg-stone-800 rounded-2xl text-center text-white">
        <span class="block text-[10px] font-semibold text-amber-300">新しい家族の管理キー</span>
        <span class="block mt-1 font-mono text-base font-bold tracking-[0.15em] select-all break-all">
          {{ issued.familyKey }}
        </span>
        <button
          type="button"
          @click="copy(issued.familyKey)"
          class="mt-2 w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-900 font-bold text-xs cursor-pointer"
        >
          {{ copied === issued.familyKey ? 'コピーしました ✓' : 'コピー' }}
        </button>
      </div>

      <p class="mt-3 text-[10px] leading-relaxed text-stone-500">
        スクショでも紙にメモでも構いません。他の人に見せないでください。設定 →「復旧コード」からいつでも再発行できます（古いコードは無効になります）。
      </p>

      <button
        type="button"
        @click="emit('joined')"
        class="mt-4 w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
      >
        メモした。はじめる 🌿
      </button>
    </template>

    <template v-else>
      <div class="text-center mb-4">
        <div class="text-4xl mb-1">🌳</div>
        <h1 class="font-bold text-base text-stone-800">FamiTree</h1>
        <p class="text-[11px] text-stone-600 mt-1">家族みんなで、ひとつの木を育てよう</p>
      </div>

      <div v-if="!isRecovery" class="flex bg-stone-200/70 p-1 rounded-2xl">
        <button
          v-for="m in (['create', 'join'] as const)"
          :key="m"
          type="button"
          @click="mode = m"
          class="flex-1 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          :class="mode === m ? 'bg-white text-stone-800 shadow-xs' : 'text-stone-500 hover:text-stone-700'"
        >
          {{ m === 'create' ? '家族をつくる' : '招待コードで参加' }}
        </button>
      </div>

      <form @submit.prevent="submit" class="mt-4 flex flex-col gap-3">
        <template v-if="mode === 'create'">
          <div>
            <label for="jf-family" class="block text-xs font-semibold text-stone-700 mb-1">家族の名前</label>
            <input id="jf-family" v-model="familyName" required maxlength="30" :class="input" placeholder="例: ひだまりファミリー" />
          </div>
        </template>

        <template v-else-if="mode === 'join'">
          <div>
            <label for="jf-code" class="block text-xs font-semibold text-stone-700 mb-1">招待コード（8文字）</label>
            <input
              id="jf-code"
              v-model="inviteCode"
              required
              maxlength="8"
              autocapitalize="characters"
              autocomplete="off"
              :class="codeInput"
            />
          </div>
        </template>

        <template v-else>
          <p class="text-[11px] leading-relaxed text-stone-600">
            <template v-if="mode === 'recover'">
              端末を失くしたときの復旧コードを入れてください。前と同じメンバーとして戻り、写真も管理者権限もそのまま残ります。
            </template>
            <template v-else>
              家族の緊急用キーを入れてください。管理者として新しい端末が加わります。キーは使い捨てで、入り直すと新しいキーが発行されます。
            </template>
          </p>
          <div>
            <label for="jf-recovery" class="block text-xs font-semibold text-stone-700 mb-1">
              {{ mode === 'recover' ? '復旧コード' : '家族の管理キー' }}
            </label>
            <input
              id="jf-recovery"
              v-model="recoveryCode"
              required
              maxlength="40"
              autocapitalize="characters"
              autocomplete="off"
              spellcheck="false"
              :class="[codeInput, 'tracking-[0.15em]']"
              placeholder="XXXX-XXXX-XXXX"
            />
          </div>
        </template>

        <template v-if="needsProfile">
          <div>
            <label for="jf-name" class="block text-xs font-semibold text-stone-700 mb-1">あなたの名前</label>
            <input id="jf-name" v-model="name" required maxlength="20" :class="input" placeholder="例: はると" />
          </div>
          <div>
            <label for="jf-role" class="block text-xs font-semibold text-stone-700 mb-1">役割</label>
            <input id="jf-role" v-model="role" required maxlength="20" :class="input" placeholder="例: 高校生、お母さん" />
          </div>

          <div>
            <span class="block text-xs font-semibold text-stone-700 mb-1">アバター</span>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="a in AVATARS"
                :key="a"
                type="button"
                @click="avatar = a"
                :aria-pressed="avatar === a"
                class="w-10 h-10 rounded-full text-xl flex items-center justify-center border-2 transition-all cursor-pointer"
                :class="avatar === a ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300' : 'border-stone-200 bg-white opacity-75 hover:opacity-100'"
              >
                {{ a }}
              </button>
            </div>
          </div>
        </template>

        <p v-if="error" role="alert" class="text-[11px] text-rose-600 font-semibold">{{ error }}</p>

        <button
          type="submit"
          :disabled="sending"
          class="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
        >
          {{ sending ? '送信中…' : submitLabel }}
        </button>

        <div class="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-1">
          <template v-if="isRecovery">
            <button type="button" :class="linkButton" @click="mode = invite ? 'join' : 'create'">← もどる</button>
          </template>
          <template v-else>
            <button type="button" :class="linkButton" @click="mode = 'recover'">端末を失くした？</button>
            <button type="button" :class="linkButton" @click="mode = 'family'">家族の管理キーを持っている</button>
          </template>
        </div>
      </form>
    </template>
  </div>
</template>
