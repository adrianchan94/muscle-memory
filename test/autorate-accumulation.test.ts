// muscle-memory · ACCUMULATION (MM_AUTORATE) — the aggregate ledger must move on an OBSERVED outcome.
//
// EVIDENCE UNDER TEST (measured 2026-08-09): across 12 completed Skill-Use mm-on cells,
// skill-plusminus.json was byte-identical to the staged copy in 12/12, and mm_tool_calls was 0 in
// 24/24. Root cause: recordPlusMinus() is reachable ONLY via rateSkill() — the manual slash command
// (index.ts:1100) or the rate_skill agent tool (index.ts:1585/1862) — and nothing autonomous calls
// either. recordObservedSkillFailure() writes only the rating-reasons.jsonl SIDECAR, never the
// aggregate. So "a library that improves with use" was false by construction.
//
// MM_AUTORATE=on (default OFF, because referee.ts deliberately holds that the learner does not grade
// its own homework) writes the aggregate from tool_end: failure -> minus, success -> plus.
import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import activate from "../mods/index";
import { PLUSMINUS_PATH } from "../mods/referee";

const KEYS = ["MM_REFLEX","MM_AUTOPILOT","MM_REFLECT","MM_NATIVE","MM_GUARD","MM_CAPTURE",
  "MM_CLOSE_NUDGE","MM_PRESCRIBE_NUDGE","MM_AGENT_SKILLS_DIR","MM_AUTORATE"] as const;
function withEnv<T>(o: Record<string,string>, fn: () => T): T {
  const saved: Record<string,string|undefined> = {};
  for (const k of KEYS) { saved[k]=process.env[k]; delete process.env[k]; }
  for (const [k,v] of Object.entries(o)) process.env[k]=v;
  try { return fn(); } finally {
    for (const k of KEYS) { if (saved[k]===undefined) delete process.env[k]; else process.env[k]=saved[k]; } }
}
type Emit = (n: string, e: unknown) => unknown;
function fakeLetta(): { letta: unknown; emit: Emit } {
  type H = (e: unknown, c: unknown) => unknown;
  const hs = new Map<string,H[]>();
  const letta = { capabilities:{events:{tools:true,lifecycle:true}},
    events:{ on:(n:string,f:H)=>{const l=hs.get(n)??[];l.push(f);hs.set(n,l);return()=>{};} }, client:null };
  const emit: Emit = (n,e)=>{ let last: unknown; for (const f of hs.get(n)??[]) last=f(e,{agent:{id:"autorate-test"},model:"test-model"}); return last; };
  return { letta, emit };
}
let shelf=""; let state=""; let SK="";
beforeEach(()=>{
  shelf=mkdtempSync(join(tmpdir(),"mm-ar-shelf-"));
  state=mkdtempSync(join(tmpdir(),"mm-ar-state-"));
  SK=`pdf-tools-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
  mkdirSync(join(shelf,SK),{recursive:true});
  writeFileSync(join(shelf,SK,"SKILL.md"),`---\nname: ${SK}\ndescription: pdf\n---\n# ${SK}\n`);
});
afterEach(()=>{ rmSync(shelf,{recursive:true,force:true}); rmSync(state,{recursive:true,force:true}); });
const ledger = () => { const p=PLUSMINUS_PATH;
  return existsSync(p) ? JSON.parse(readFileSync(p,"utf8")) : {}; };

function skillCall(emit: Emit, tid: string, status: string) {
  emit("tool_start",{toolName:"Skill",toolCallId:tid,args:{skill:SK},conversationId:"c1"});
  return emit("tool_end",{toolName:"Skill",toolCallId:tid,args:{skill:SK},status,output:"x",conversationId:"c1"});
}

test("autorate OFF (default) · the aggregate ledger does NOT move — the shipped boundary holds", () => {
  withEnv({ MM_AGENT_SKILLS_DIR: shelf }, () => {
    const { letta, emit } = fakeLetta(); const d = activate(letta as any);
    try { skillCall(emit,"t-off-1","error"); } finally { (d as any)?.(); }
    expect(ledger()[SK]).toBeUndefined();
  });
});

test("autorate ON · a FAILED Skill call writes a minus to the aggregate ledger", () => {
  withEnv({ MM_AUTORATE:"on", MM_AGENT_SKILLS_DIR: shelf }, () => {
    const { letta, emit } = fakeLetta(); const d = activate(letta as any);
    try { skillCall(emit,"t-fail-1","error"); } finally { (d as any)?.(); }
    expect(ledger()[SK]?.minus).toBe(1);
  });
});

test("autorate ON · a SUCCESSFUL Skill call writes a plus — success must count, or nothing accumulates", () => {
  withEnv({ MM_AUTORATE:"on", MM_AGENT_SKILLS_DIR: shelf }, () => {
    const { letta, emit } = fakeLetta(); const d = activate(letta as any);
    try { skillCall(emit,"t-ok-1","success"); } finally { (d as any)?.(); }
    expect(ledger()[SK]?.plus).toBe(1);
  });
});

test("autorate ON · idempotent per toolCallId — a re-emitted tool_end never double-counts", () => {
  withEnv({ MM_AUTORATE:"on", MM_AGENT_SKILLS_DIR: shelf }, () => {
    const { letta, emit } = fakeLetta(); const d = activate(letta as any);
    try { skillCall(emit,"t-dup","success"); skillCall(emit,"t-dup","success"); } finally { (d as any)?.(); }
    expect(ledger()[SK]?.plus).toBe(1);
  });
});
