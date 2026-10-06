<script setup lang="ts">
import { ref } from 'vue';
import { createFamily, joinFamily } from '../api';
import { describeError } from '../session';

const emit = defineEmits<{ (e: 'joined'): void }>();

const AVATARS = ['👦', '👧', '👨‍💼', '👩‍🍳', '👴', '👵', '🧑'];

// ?invite=CODE で来たら参加モードで開く。読んだらURLから消す
const invite = new URLSearchParams(location.search).get('invite');
if (invite) history.replaceState(null, '', location.pathname);

const mode = ref<'create' | 'join'>(invite ? 'join' : 'create');
const familyName = ref('');
const inviteCode = ref((invite ?? '').trim().toUpperCase().slice(0, 8));
const name = ref('');
const role = ref('');
const avatar = ref(AVATARS[0]);
const error = ref('');
const sending = ref(false);

const submit = async () => {
  if (sending.value) return;
  sending.value = true;
  error.value = '';
  const profile = { name: name.value.trim(), role: role.value.trim(), avatar: avatar.value };
  try {
    if (mode.value === 'create') await createFamily(familyName.value.trim(), profile);
    else await joinFamily(inviteCode.value.trim().toUpperCase(), profile);
    emit('joined');
  } catch (e) {
    error.value = describeError(e);
  } finally {
    sending.value = false;
  }
};

const input = 'w-full px-3 py-2 rounded-xl bg-white border border-stone-200 text-xs focus:outline-emerald-500';
</script>

<template>
  <div class="flex-1 flex flex-col justify-center p-6 overflow-y-auto">
    <div class="text-center mb-4">
      <div class="text-4xl mb-1">🌳</div>
      <h1 class="font-bold text-base text-stone-800">FamiTree</h1>
      <p class="text-[11px] text-stone-600 mt-1">家族みんなで、ひとつの木を育てよう</p>
    </div>

    <div class="flex bg-stone-200/70 p-1 rounded-2xl">
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
      <div v-if="mode === 'create'">
        <label for="jf-family" class="block text-xs font-semibold text-stone-700 mb-1">家族の名前</label>
        <input id="jf-family" v-model="familyName" required maxlength="30" :class="input" placeholder="例: ひだまりファミリー" />
      </div>
      <div v-else>
        <label for="jf-code" class="block text-xs font-semibold text-stone-700 mb-1">招待コード（8文字）</label>
        <input
          id="jf-code"
          v-model="inviteCode"
          required
          maxlength="8"
          autocapitalize="characters"
          autocomplete="off"
          :class="[input, 'font-mono tracking-widest uppercase']"
        />
      </div>

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

      <p v-if="error" role="alert" class="text-[11px] text-rose-600 font-semibold">{{ error }}</p>

      <button
        type="submit"
        :disabled="sending"
        class="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
      >
        {{ sending ? '送信中…' : mode === 'create' ? '木を植える 🌱' : '家族の木に参加する 🌿' }}
      </button>
    </form>
  </div>
</template>
