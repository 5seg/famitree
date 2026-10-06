<script setup lang="ts">
import { X, Droplets, Flame, Heart, Crown, UserMinus } from 'lucide-vue-next';
import { useModalA11y } from '../composables/useModalA11y';
import type { FamilyMember } from '../types';

const props = defineProps<{
  member: FamilyMember | null;
  viewerIsAdmin?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'sendHeart', member: FamilyMember): void;
  (e: 'removeMember', member: FamilyMember): void;
  (e: 'toggleAdmin', member: FamilyMember): void;
}>();

useModalA11y(() => props.member !== null, () => emit('close'));
</script>

<template>
  <div
    v-if="member"
    @click.self="$emit('close')"
    role="dialog"
    aria-modal="true"
    aria-labelledby="member-detail-title"
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-stone-900/50 backdrop-blur-xs"
  >
    <div
      class="bg-white rounded-t-3xl sm:rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-stone-200 text-stone-800 relative"
    >
      <div class="flex items-center justify-between pb-3 border-b border-stone-100">
        <span id="member-detail-title" class="text-xs font-semibold text-stone-500">家族のプロフィール</span>
        <button
          @click="$emit('close')"
          aria-label="閉じる"
          class="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 hover:bg-stone-200 cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="pt-4 flex flex-col items-center text-center">
        <div class="w-16 h-16 rounded-full flex items-center justify-center text-3xl border-2 border-stone-200 shadow-sm mb-2 bg-amber-50">
          {{ member.avatar }}
        </div>
        <h3 class="text-base font-bold text-stone-800 flex items-center gap-1.5">
          {{ member.name }}
          <span
            v-if="member.isAdmin"
            class="px-1.5 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-800 text-[10px] font-semibold flex items-center gap-0.5"
          >
            <Crown class="w-3 h-3 fill-amber-500 text-amber-500" />
            管理者
          </span>
        </h3>
        <span class="text-xs text-stone-500">{{ member.role }}</span>

        <!-- Status badge -->
        <div class="mt-3 flex items-center gap-2">
          <span
            class="px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5"
            :class="member.wateredToday ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'"
          >
            <template v-if="member.wateredToday">
              <Droplets class="w-3.5 h-3.5 fill-emerald-600 text-emerald-600" />
              <span>本日の水やり完了</span>
            </template>
            <template v-else>
              <span class="w-2 h-2 rounded-full bg-stone-400" />
              <span>まだ水やりしていません</span>
            </template>
          </span>

          <span class="px-2.5 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold flex items-center gap-1">
            <Flame class="w-3.5 h-3.5 fill-orange-500 text-orange-500" />
            <span>{{ member.streak }}日</span>
          </span>
        </div>

        <p class="mt-4 text-xs text-stone-600 bg-stone-50 p-3 rounded-2xl border border-stone-100 leading-relaxed">
          GPSや細かなオンライン時間は記録されません。<br />
          木を一緒に育てているという温かい存在感だけを共有しています。
        </p>

        <button
          v-if="!member.isCurrentUser"
          @click="() => { if (member) { $emit('sendHeart', member); $emit('close'); } }"
          class="mt-4 w-full py-2.5 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <Heart class="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
          <span>そっとハート（見守りエール）を送る</span>
        </button>

        <!-- 家族管理 (管理者のみ) -->
        <div v-if="viewerIsAdmin && !member.isCurrentUser" class="mt-4 w-full pt-4 border-t border-stone-100">
          <span class="text-[10px] font-semibold text-stone-400">家族の管理</span>
          <button
            @click="$emit('toggleAdmin', member)"
            class="mt-2 w-full py-2.5 px-4 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Crown class="w-3.5 h-3.5" />
            <span>{{ member.isAdmin ? '管理者を外す' : '管理者にする' }}</span>
          </button>
          <button
            @click="$emit('removeMember', member)"
            class="mt-2 w-full py-2.5 px-4 rounded-2xl bg-stone-100 hover:bg-rose-50 border border-stone-200 hover:border-rose-200 text-stone-600 hover:text-rose-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <UserMinus class="w-3.5 h-3.5" />
            <span>家族から外す</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
