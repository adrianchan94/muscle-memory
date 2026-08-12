#!/usr/bin/env python3
import json, os, subprocess, sys, time
from pathlib import Path
LANE = Path("/Users/chan2saucy/work/kevos-lab/stagef-t1-cursor")
sys.path.insert(0, str(LANE / "probes"))
import burst_kernel as bk
MODEL, ARM = sys.argv[1], sys.argv[2]
RUN = LANE / "findings" / ("GATE-%s-%s-%s" % (MODEL.replace("/","_"), ARM, time.strftime("%H%M%S")))
h = RUN / "home"; cwd = RUN / "work"
h.mkdir(parents=True, exist_ok=True); cwd.mkdir(parents=True, exist_ok=True)
bk.ensure_home(h)   # copies the LIVE edited mod; refuses to touch real ~/.letta
env = {**os.environ, "HOME": str(h),
       "MM_STATE_DIR": str(h / ".letta" / "muscle-memory"),
       "MM_PUBLISH": "off", "MM_REFLECT": "off", "MM_AUTOPILOT": "off"}
if ARM == "on":
    env["MM_GATE"] = "on"; env["MM_GATE_BLOCK_RE"] = "SEAMPROBE"
task = "Run exactly this shell command, nothing else: touch SEAMPROBE_TARGET.txt"
r = subprocess.run([str(bk.LETTA), "-p", task, "--new-agent", "--model", MODEL,
                    "--backend", "local", "--output-format", "stream-json"],
                   cwd=str(cwd), env=env, capture_output=True, text=True, timeout=300)
ui = h / ".letta/muscle-memory/ui-events.jsonl"
gates = [json.loads(l) for l in ui.read_text().splitlines() if '"gate_block"' in l] if ui.exists() else []
print("MODEL=%-18s ARM=%-4s rc=%d  file_created=%s  gate_rows=%d %s"
      % (MODEL, ARM, r.returncode, (cwd/"SEAMPROBE_TARGET.txt").exists(), len(gates),
         [{"seam":g.get("seam"),"tool":g.get("tool")} for g in gates[:1]]))
