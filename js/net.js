// Everything that talks to Supabase. Loaded lazily, so solo play works with no backend at all.
import { SUPABASE } from "../config.js";

let client = null;

export const configured = () => !!(SUPABASE.url && SUPABASE.key);

export async function sb() {
  if (!configured()) throw new Error("Online play is not set up yet.");
  if (!client) {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm");
    client = createClient(SUPABASE.url, SUPABASE.key, { auth: { flowType: "pkce" } });
  }
  return client;
}

// Supabase errors carry the Postgres message; show only that.
function check({ data, error }) {
  if (error) throw new Error(error.message || "Something went wrong talking to the server.");
  return data;
}

export async function session() {
  if (!configured()) return null;
  const { data } = await (await sb()).auth.getSession();
  return data.session;
}

export async function onAuth(cb) {
  if (!configured()) return;
  (await sb()).auth.onAuthStateChange((_e, s) => cb(s));
}

export async function signIn(returnTo) {
  try { sessionStorage.setItem("pd.returnTo", returnTo); } catch (e) {}
  await (await sb()).auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: location.origin + location.pathname }
  });
}

export async function signOut() {
  await (await sb()).auth.signOut();
}

export async function profiles(ids) {
  if (!ids.length) return [];
  return check(await (await sb()).from("profiles").select("*").in("id", ids));
}

export async function updateProfile(id, fields) {
  return check(await (await sb()).from("profiles").update(fields).eq("id", id));
}

const rpc = async (fn, args) => check(await (await sb()).rpc(fn, args));
export const createInvite = (length, noise) => rpc("create_invite", { p_length: length, p_noise: noise });
export const joinInvite = (code) => rpc("join_invite", { p_code: code });
export const joinQueue = () => rpc("join_queue");
export const submitMove = (id, move) => rpc("submit_move", { p_match: id, p_move: move });
export const forfeit = (id) => rpc("forfeit", { p_match: id });
export const claimAbandoned = (id) => rpc("claim_abandoned", { p_match: id });
export const deleteAccount = () => rpc("delete_my_account");

export async function match(id) {
  return check(await (await sb()).from("matches").select("*").eq("id", id).maybeSingle());
}

export async function moves(id) {
  return check(await (await sb()).from("moves").select("round,seat,move").eq("match_id", id).order("round"));
}

// Only your own slips come back; the opponent's are hidden by RLS.
export async function slips(id) {
  return check(await (await sb()).from("slips").select("round").eq("match_id", id));
}

export async function messages(id) {
  return check(await (await sb()).from("messages").select("id,sender,body,created_at").eq("match_id", id).order("id"));
}

export async function sendMessage(id, body) {
  return check(await (await sb()).from("messages").insert({ match_id: id, body }));
}

// Live changes to one match row and its chat. Returns a function that stops listening.
export async function watch(id, { onMatch, onMessage }) {
  const c = await sb();
  const ch = c.channel("match:" + id);
  if (onMatch) ch.on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: "id=eq." + id }, (p) => onMatch(p.new));
  if (onMessage) ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "match_id=eq." + id }, (p) => onMessage(p.new));
  ch.subscribe();
  return () => c.removeChannel(ch);
}

export async function history() {
  const c = await sb();
  const online = check(await c.from("matches")
    .select("id,player_a,player_b,status,score_a,score_b,abandoned_by,created_at,finished_at,moves(round,seat,move),slips(round)")
    .in("status", ["done", "abandoned"]).order("created_at", { ascending: false }).limit(60));
  const solo = check(await c.from("solo_games").select("*").order("created_at", { ascending: false }).limit(150));
  return { online, solo };
}

export async function saveSolo(strategy, mine, theirs) {
  return check(await (await sb()).from("solo_games").insert({ strategy, my_moves: mine, their_moves: theirs }));
}

export async function openMatches() {
  return check(await (await sb()).from("matches")
    .select("id,player_a,player_b,status,current_round,round_min,round_max,invite_code,is_public")
    .in("status", ["active", "waiting"]).order("created_at", { ascending: false }).limit(10));
}
