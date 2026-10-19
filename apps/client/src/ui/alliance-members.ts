import { canKick, canPerform, demotedRank, promotedRank, type AllianceMemberView, type AllianceView } from "@revolt/rules";
import { formatAmount } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import type { AllianceOutcome, AllianceStore } from "../state/alliance-store.ts";
import type { MemberAction } from "../net/api.ts";
import { userText } from "./alliance-rows.ts";
import type { ConfirmDialog } from "./confirm-dialog.ts";
import { el } from "./dom.ts";

export interface AllianceMembers {
  readonly root: HTMLElement;
  readonly update: (alliance: AllianceView) => void;
}

interface MembersDeps {
  readonly store: AllianceStore;
  readonly confirm: ConfirmDialog;
  readonly onError: (reason: string | null) => void;
}

/** Which of the four member actions the viewer's rank allows on this member. */
export const memberActions = (viewer: AllianceView["myRank"], member: AllianceMemberView): MemberAction[] => {
  if (member.me) return [];
  const out: MemberAction[] = [];
  if (canKick(viewer, member.rank)) out.push("kick");
  if (canPerform(viewer, "promote") && promotedRank(member.rank) !== null) out.push("promote");
  if (canPerform(viewer, "demote") && demotedRank(member.rank) !== null) out.push("demote");
  if (canPerform(viewer, "transfer")) out.push("transfer");
  return out;
};

const structureKey = (a: AllianceView): string =>
  [currentLanguage(), a.id, a.name, a.myRank, a.maxMembers, a.hq?.x, a.hq?.y, ...a.members.map((m) => `${m.handle}:${m.rank}:${m.me ? 1 : 0}`)].join("|");

/** Rank labels and, where the viewer's rank allows, remove / promote / demote / hand-over buttons; plus leaving. */
export const createAllianceMembers = ({ store, confirm, onError }: MembersDeps): AllianceMembers => {
  const root = el("div", "alliance-members");
  let key = "";

  const report = (outcome: AllianceOutcome): void => onError(outcome.ok ? null : outcome.reason);

  const act = async (action: MemberAction, handle: string): Promise<void> => {
    onError(null);
    // Removing someone and handing over leadership cannot be taken back by the player alone.
    if (action === "kick" && !(await confirm.ask(t("alliance.confirmKick", { handle })))) return;
    if (action === "transfer" && !(await confirm.ask(t("alliance.confirmTransfer", { handle })))) return;
    report(await store.memberAction(action, handle));
  };

  const leave = async (a: AllianceView): Promise<void> => {
    onError(null);
    if (a.myRank === "leader" && a.members.length > 1) return onError("leader_must_transfer");
    const sole = a.myRank === "leader";
    if (!(await confirm.ask(t(sole ? "alliance.confirmDisband" : "alliance.confirmLeave")))) return;
    report(await store.leave());
  };

  const render = (a: AllianceView): void => {
    const lang = currentLanguage();
    root.replaceChildren();
    const head = el("div", "alliance-head");
    const tag = userText("span", a.tag, "alliance-tag-badge");
    // Tags are ASCII, as the map draws them: left to right in every language.
    tag.setAttribute("dir", "ltr");
    head.append(userText("h3", a.name, "alliance-name-title"), tag);
    root.append(head);
    root.append(
      el(
        "p",
        "panel-desc",
        a.hq === null
          ? t("alliance.hqNone")
          : t("alliance.hqAt", { x: formatAmount(lang, a.hq.x), y: formatAmount(lang, a.hq.y) }),
      ),
    );

    const list = el("ul", "member-list");
    list.setAttribute("aria-label", t("alliance.tab.members"));
    for (const m of a.members) {
      const li = el("li", m.me ? "member-row me" : "member-row");
      li.dataset.testid = "member";
      li.dataset.handle = m.handle;
      li.dataset.rank = m.rank;
      const who = el("div", "member-who");
      const rank = el("span", "rank-badge", t(`alliance.rank.${m.rank}`));
      rank.dataset.rank = m.rank;
      who.append(userText("bdi", m.handle, "member-handle"), rank);
      if (m.me) who.append(el("span", "member-you", t("alliance.you")));
      li.append(who);
      const actions = el("div", "member-actions");
      for (const action of memberActions(a.myRank, m)) {
        const b = el("button", action === "kick" ? "small-btn danger" : "small-btn", t(`alliance.action.${action}`));
        b.type = "button";
        b.dataset.testid = `member-${action}-${m.handle}`;
        b.addEventListener("click", () => void act(action, m.handle));
        actions.append(b);
      }
      li.append(actions);
      list.append(li);
    }
    root.append(list);

    const leaveBtn = el("button", "secondary-btn", t("alliance.leave"));
    leaveBtn.type = "button";
    leaveBtn.dataset.testid = "alliance-leave";
    leaveBtn.addEventListener("click", () => void leave(a));
    root.append(leaveBtn);
    if (a.myRank === "leader" && a.members.length > 1) root.append(el("p", "panel-desc", t("alliance.leaderMustTransfer")));
  };

  return {
    root,
    update: (a) => {
      const k = structureKey(a);
      if (k === key) return;
      key = k;
      render(a);
    },
  };
};
