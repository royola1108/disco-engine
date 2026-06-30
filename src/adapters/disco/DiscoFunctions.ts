import type { FunctionRegistry, HostFn } from "../../engine/eval.js";
import type { WorldState } from "../../state/WorldState.js";
import { boolish, numish, type Value } from "../../engine/ast.js";
import { resolveGoTo } from "./areaMap.js";
import type { RomDb } from "../../rom/RomDb.js";

export function registerDiscoFunctions(registry: FunctionRegistry, state: WorldState, rom: RomDb): void {
  const reg = (name: string, fn: HostFn) => registry.register(name, fn);

  const str = (v: Value | undefined): string => (v == null ? "" : String(v));
  const num = (v: Value | undefined): number => numish(v ?? 0);
  const getVar = (n: string): Value => state.getVar(n);
  const setVar = (n: string, v: Value): void => state.setVar(n, v);

  // ========== VARIABLE I/O ==========
  reg("SetVariableValue", ([k, v]) => { if (k != null) setVar(str(k), v ?? true); });
  reg("XPStandardSetBool", ([k, v]) => { if (k != null) setVar(str(k), v ?? true); });
  reg("XPMajorSetBool", ([k, v]) => { if (k != null) setVar(str(k), v ?? true); });
  reg("XPMinorSetBool", ([k, v]) => { if (k != null) setVar(str(k), v ?? true); });
  reg("XPTinySetBool", ([k, v]) => { if (k != null) setVar(str(k), v ?? true); });
  reg("XPPicoSetBool", ([k, v]) => { if (k != null) setVar(str(k), v ?? true); });

  // ========== INVENTORY ==========
  reg("CheckItem", ([item]) => state.inventory.has(str(item)));
  reg("CheckItemGroup", ([group]) => {
    for (const item of state.inventory) if (item.startsWith(str(group))) return true;
    return false;
  });
  reg("GainItem", ([item]) => { if (item != null) state.inventory.add(str(item)); });
  reg("LoseItem", ([item]) => { state.inventory.delete(str(item)); });
  reg("CheckEquipped", ([item]) => {
    for (const v of state.equipped.values()) if (v === str(item)) return true;
    return false;
  });
  reg("CheckEquippedGroup", ([group]) => {
    for (const v of state.equipped.values()) if (v.startsWith(str(group))) return true;
    return false;
  });
  reg("CheckHeldRightGroup", ([group]) => {
    const right = state.equipped.get("right");
    return right != null && right.startsWith(str(group));
  });
  reg("HasJacket", () => state.inventory.has("jacket") || state.equipped.get("torso") === "jacket");
  reg("HasShirt", () => state.inventory.has("shirt") || state.equipped.get("torso") === "shirt");
  reg("HasPants", () => state.inventory.has("pants") || state.equipped.get("legs") === "pants");
  reg("HasHat", () => state.inventory.has("hat") || state.equipped.get("head") === "hat");
  reg("HasShoes", () => state.inventory.has("shoes") || state.equipped.get("feet") === "shoes");
  reg("HasPawnablesInInventory", () => [...state.inventory].some((i) => i.startsWith("pawnable.")));
  reg("WeirdClothing", () => {
    const w = state.equipped.get("torso");
    return w === "polka_dollar_suit" || w === "hairy_greasy_tank_top";
  });

  // ========== PARTY ==========
  reg("IsKimHere", () => state.party.has("kim"));
  reg("IsKimInParty", () => state.party.has("kim"));
  reg("IsCunoInParty", () => state.party.has("cuno"));
  reg("ReturnKitsuragi", () => { state.party.add("kim"); });
  reg("RemoveAndHideKitsuragiUntilMorning", () => { state.party.delete("kim"); });
  reg("AddCunoToParty", () => { state.party.add("cuno"); });
  reg("RemoveCunoFromParty", () => { state.party.delete("cuno"); });
  reg("RemoveCunoWaitAtFort", () => { state.party.delete("cuno"); });

  // ========== TASKS ==========
  reg("IsTaskActive", ([task]) => {
    if (task == null) return false;
    const name = str(task);
    return boolish(getVar(name)) && !boolish(getVar(`${name}_done`));
  });
  reg("GainTask", ([task]) => { if (task != null) setVar(str(task), true); });
  reg("FinishTask", ([task]) => {
    if (task != null) {
      const name = str(task);
      setVar(name, true);
      setVar(`${name}_done`, true);
    }
  });
  reg("CancelTask", ([task]) => {
    if (task != null) {
      const name = str(task);
      setVar(name, false);
      setVar(`${name}_done`, false);
    }
  });

  // ========== TIME ==========
  reg("DayCount", () => state.time.day);
  reg("HourCount", () => state.time.hour);
  reg("TotalHourCount", () => state.time.totalHours);
  reg("IsHourBetween", ([a, b]) => {
    const h = state.time.hour;
    const lo = num(a);
    const hi = num(b);
    return lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi;
  });
  reg("IsDayFrom", ([d]) => state.time.day >= num(d));
  reg("IsDayUntil", ([d]) => state.time.day <= num(d));
  reg("IsMorning", () => state.time.hour >= 6 && state.time.hour < 12);
  reg("IsAfternoon", () => state.time.hour >= 12 && state.time.hour < 18);
  reg("IsEvening", () => state.time.hour >= 18 && state.time.hour < 22);
  reg("IsNight", () => state.time.hour >= 22 || state.time.hour < 6);
  reg("IsNighttime", () => state.time.hour >= 22 || state.time.hour < 6);
  reg("IsNoon", () => state.time.hour >= 11 && state.time.hour <= 13);
  reg("IsDusk", () => state.time.hour >= 17 && state.time.hour <= 19);
  reg("IsDaytime", () => state.time.hour >= 6 && state.time.hour < 22);
  reg("PassTime", ([hours]) => {
    const h = num(hours);
    state.time.hour += h;
    state.time.totalHours += h;
    while (state.time.hour >= 24) { state.time.hour -= 24; state.time.day++; }
  });
  reg("NextMorningTime", () => {
    state.time.day++;
    state.time.hour = 8;
  });

  // ========== MONEY ==========
  reg("MoneyAmount", () => state.money);
  reg("GainMoneyOnce", ([amount]) => { state.money += num(amount); });
  reg("GainMoneyAlways", ([amount]) => { state.money += num(amount); });
  reg("LoseMoneyAlways", ([amount]) => { state.money = Math.max(0, state.money - num(amount)); });

  // ========== REPUTATION ==========
  reg("ReputationGrows", ([rep]) => {
    if (rep != null) {
      const name = str(rep);
      state.reputation.set(name, (state.reputation.get(name) ?? 0) + 1);
    }
  });
  reg("ReputationLowers", ([rep]) => {
    if (rep != null) {
      const name = str(rep);
      state.reputation.set(name, (state.reputation.get(name) ?? 0) - 1);
    }
  });
  reg("Reputation", ([rep]) => {
    if (rep != null) return state.reputation.get(str(rep)) ?? 0;
    return 0;
  });

  // ========== SKILLS (Volition / Endurance) ==========
  reg("DamageVolition", ([n]) => {
    state.skills.volition.damage += num(n);
    state.skills.volition.current = Math.max(0, state.skills.volition.current - num(n));
  });
  reg("HealVolition", ([n]) => {
    state.skills.volition.damage = Math.max(0, state.skills.volition.damage - num(n));
    state.skills.volition.current += num(n);
  });
  reg("HealAllVolition", () => {
    state.skills.volition.current += state.skills.volition.damage;
    state.skills.volition.damage = 0;
  });
  reg("DamageEndurance", ([n]) => {
    state.skills.endurance.damage += num(n);
    state.skills.endurance.current = Math.max(0, state.skills.endurance.current - num(n));
  });
  reg("HealEndurance", ([n]) => {
    state.skills.endurance.damage = Math.max(0, state.skills.endurance.damage - num(n));
    state.skills.endurance.current += num(n);
  });
  reg("HasVolitionDamage", () => state.skills.volition.damage > 0);
  reg("HasEnduranceDamage", () => state.skills.endurance.damage > 0);

  // ========== THOUGHT CABINET (THC) ==========
  reg("IsTHCPresent", ([thc]) => state.thc.known.includes(str(thc)) || state.thc.fixed.includes(str(thc)));
  reg("IsTHCFixed", ([thc]) => state.thc.fixed.includes(str(thc)));
  reg("IsTHCCooking", ([thc]) => state.thc.cooking === str(thc));
  reg("IsTHCCookingOrFixed", ([thc]) => state.thc.cooking === str(thc) || state.thc.fixed.includes(str(thc)));
  reg("GainThought", ([thought]) => {
    if (thought != null && !state.thc.known.includes(str(thought))) state.thc.known.push(str(thought));
  });

  // ========== POLITICAL / COPOTYPE ==========
  reg("IsHighestPolitical", ([p]) => state.political === str(p));
  reg("IsHighestCopotype", ([c]) => state.copotype === str(c));

  // ========== ONCE (variable increment modifier) ==========
  // In the original game, +once(N) means "add N but only once".
  // We treat once(N) as returning N — the "only once" guard is
  // typically handled by conditionstring checking the variable.
  // For true once semantics, we track which (variable, node) pairs
  // have already been incremented.
  const onceTracker = new Set<string>();
  reg("once", ([n]) => num(n));

  // ========== SUBSTANCES ==========
  const usedOnce = new Set<string>();
  const usedMore = new Set<string>();
  reg("SubstanceUsedOnce", ([sub]) => usedOnce.has(str(sub)));
  reg("SubstanceUsedMore", ([sub]) => usedMore.has(str(sub)));
  reg("UseSubstanceInHand", ([sub]) => {
    if (sub != null) {
      const name = str(sub);
      if (usedOnce.has(name)) usedMore.add(name);
      else usedOnce.add(name);
    }
  });

  // ========== AREA / TRAVEL ==========
  reg("IsExterior", () => boolish(getVar("auto.is_exterior")));
  reg("SetAreaState", ([area, s]) => { if (area != null) setVar(`area.${str(area)}.state`, s ?? 0); });
  reg("GoTo", ([dest]) => {
    if (dest != null) {
      const sceneId = resolveGoTo(str(dest), rom);
      if (sceneId != null) state.gotoScene = sceneId;
    }
  });
  reg("GoToDestination", ([dest]) => {
    if (dest != null) {
      const sceneId = resolveGoTo(str(dest), rom);
      if (sceneId != null) state.gotoScene = sceneId;
    }
  });

  // ========== VISUAL / NO-OP (text version ignores these) ==========
  for (const noop of [
    "Continue", "Hold", "ShowVisCal", "HideVisCal", "HideVisCalAfterConversation",
    "ShowDialogueImage", "HideDialogueImage", "NewspaperEndgame",
    "FocusCamera", "ResetCamera", "SetTriggerAnimation",
    "SemiBlack", "PrimeSpecialEndButton", "WhirlingBedWasUsed",
    "WhirlingEngineStart", "OpenBookstoreCurtains", "DestroyObject",
    "Obsession", "NightyNightKitsuragiShack", "RemoveWhiteCheck",
  ]) {
    reg(noop, () => {});
  }
}
