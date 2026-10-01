<script setup lang="ts">
import { Droplets, Clock } from 'lucide-vue-next';
import type { FamilyMember } from '../types';

defineProps<{
  members: FamilyMember[];
}>();

defineEmits<{
  (e: 'selectMember', member: FamilyMember): void;
}>();
</script>

<template>
  <div class="px-4 py-2">
    <div class="bg-stone-50/95 backdrop-blur-md rounded-2xl p-2.5 border border-stone-200/80 shadow-xs">
      <div class="flex items-center justify-between gap-1">
        <button
          v-for="member in members"
          :key="member.id"
          @click="$emit('selectMember', member)"
          class="flex-1 flex flex-col items-center p-1.5 rounded-xl hover:bg-stone-100/80 active:scale-95 transition-all relative cursor-pointer"
        >
          <!-- Avatar with Watered Indicator Badge -->
          <div class="relative">
            <div
              class="w-12 h-12 rounded-full flex items-center justify-center text-xl border-2 transition-all shadow-xs"
              :class="[
                member.avatarColor,
                member.wateredToday
                  ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-stone-50'
                  : 'opacity-85'
              ]"
            >
              {{ member.avatar }}
            </div>

            <!-- Status indicator badge (strictly ambient, no timestamp/GPS) -->
            <div
              class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] shadow-sm border border-white"
              :class="member.wateredToday ? 'bg-emerald-500 text-white' : 'bg-stone-200 text-stone-500'"
              :title="member.wateredToday ? '水やり完了' : 'まだ'"
            >
              <Droplets v-if="member.wateredToday" class="w-3 h-3 fill-white" />
              <Clock v-else class="w-2.5 h-2.5" />
            </div>
          </div>

          <!-- Name & Role tag -->
          <div class="mt-1.5 text-center">
            <span class="block text-xs font-semibold text-stone-800 leading-tight">
              {{ member.name }}
            </span>
            <span class="block text-[10px] text-stone-600 font-medium">
              {{ member.role }}
            </span>
          </div>

          <!-- Status pill text -->
          <span
            class="mt-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium"
            :class="member.wateredToday ? 'bg-emerald-100/90 text-emerald-800' : 'bg-stone-100 text-stone-600'"
          >
            {{ member.wateredToday ? '💧 水やり完了' : '⏳ まだ' }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
