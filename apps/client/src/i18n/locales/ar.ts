import type { LocaleShape } from "../locale-shape.ts";

export const ar: LocaleShape = {
  app: { title: "revolt (نموذج أولي)" },
  resource: {
    food: "المؤن",
    materiel: "السلاح",
    funds: "الأموال",
    support: "الدعم الشعبي",
  },
  building: {
    hq: { name: "مركز القيادة", desc: "يحدد المستوى الأقصى لباقي المباني ويرفع سعة التخزين." },
    farm: { name: "المزرعة", desc: "تنتج المؤن." },
    armory: { name: "مخزن السلاح", desc: "ينتج السلاح." },
    treasury: { name: "الخزينة", desc: "تجمع الأموال." },
  },
  panel: {
    level: "المستوى {{level}}",
    production: "الإنتاج",
    perHour: "{{amount}}/سا",
    storage: "سعة التخزين",
    nextLevel: "الترقية إلى المستوى {{level}}",
    cost: "التكلفة",
    duration: "المدة",
    upgrade: "ترقية",
    upgrading: "جارٍ الترقية إلى المستوى {{level}}",
    maxLevel: "تم بلوغ المستوى الأقصى",
    close: "إغلاق",
  },
  reason: {
    queue_busy: "هناك ترقية أخرى قيد التنفيذ",
    max_level: "تم بلوغ المستوى الأقصى",
    hq_gate: "يتطلب مركز القيادة من المستوى {{level}}",
    insufficient: "الموارد غير كافية",
  },
  queue: { idle: "العمال متفرغون — اضغط على مبنى", busy: "{{building}} ← المستوى {{level}}" },
  time: { h: "{{count}} سا", m: "{{count}} د", s: "{{count}} ثا", done: "اكتمل" },
  settings: { language: "اللغة" },
  language: { en: "English", fr: "Français", ar: "العربية" },
};
