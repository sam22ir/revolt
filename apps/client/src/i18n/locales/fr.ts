import type { LocaleShape } from "../locale-shape.ts";

export const fr: LocaleShape = {
  app: { title: "revolt (prototype)" },
  resource: {
    food: "Vivres",
    materiel: "Armes",
    funds: "Fonds",
    support: "Soutien populaire",
  },
  building: {
    hq: {
      name: "Poste de commandement",
      desc: "Fixe le niveau maximal des autres bâtiments et augmente le stockage.",
    },
    farm: { name: "Ferme", desc: "Produit des vivres." },
    armory: { name: "Armurerie", desc: "Produit des armes." },
    treasury: { name: "Trésorerie", desc: "Collecte des fonds." },
  },
  panel: {
    level: "Niveau {{level}}",
    production: "Production",
    perHour: "{{amount}}/h",
    storage: "Limite de stockage",
    nextLevel: "Amélioration au niveau {{level}}",
    cost: "Coût",
    duration: "Durée",
    upgrade: "Améliorer",
    upgrading: "Amélioration au niveau {{level}}",
    maxLevel: "Niveau maximal atteint",
    close: "Fermer",
  },
  reason: {
    queue_busy: "Une autre amélioration est en cours",
    max_level: "Niveau maximal atteint",
    hq_gate: "Nécessite le poste de commandement niveau {{level}}",
    insufficient: "Ressources insuffisantes",
  },
  queue: { idle: "Ouvriers libres — touchez un bâtiment", busy: "{{building}} → niveau {{level}}" },
  time: { h: "{{count}} h", m: "{{count}} min", s: "{{count}} s", done: "Terminé" },
  settings: { language: "Langue" },
  language: { en: "English", fr: "Français", ar: "العربية" },
};
