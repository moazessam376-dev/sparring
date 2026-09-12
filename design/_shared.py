HEAD = '''<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; color: #e2e5e4; font-family: "Archivo", system-ui, sans-serif; font-size: 13px; -webkit-font-smoothing: antialiased; }
    a { color: #9ee87d; } a:hover { color: #e2e5e4; }
    .m { font-family: "DM Mono", ui-monospace, monospace; font-weight: 300; }
    .lbl { font-family: "DM Mono", monospace; font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: #626a69; }
    button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; text-align: left; }
    input, textarea { font: inherit; color: #e2e5e4; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
      border-radius: 8px; padding: 11px 13px; width: 100%; outline: none; resize: none; }
    input:focus, textarea:focus { border-color: rgba(158,232,125,0.45); background: rgba(158,232,125,0.04); }
    input::placeholder, textarea::placeholder { color: #4a5150; }
    .glass { background: rgba(24,26,27,0.58); backdrop-filter: blur(32px) saturate(135%); -webkit-backdrop-filter: blur(32px) saturate(135%); }
    .glass-content { background: rgba(21,23,24,0.86); backdrop-filter: blur(44px) saturate(118%); -webkit-backdrop-filter: blur(44px) saturate(118%); }
    .hair { box-shadow: inset 0 1px 0 rgba(255,255,255,0.07); }
    .panel { background: rgba(255,255,255,0.028); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05); }
    .rail { border-right: 1px solid rgba(255,255,255,0.07); box-shadow: inset 0 1px 0 rgba(255,255,255,0.07), 14px 0 38px rgba(0,0,0,0.24); }
    .pill { border-radius: 7px; padding: 5px 11px; font-size: 12px; }
    .go { background: rgba(158,232,125,0.13); border: 1px solid rgba(158,232,125,0.34); color: #9ee87d; }
    .ghost { border: 1px solid rgba(255,255,255,0.09); color: #979e9d; }
    @keyframes drift { 0% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(-2.5%,1.5%,0) scale(1.06); } 100% { transform: translate3d(0,0,0) scale(1); } }
    @keyframes rise { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
    .ground { animation: drift 54s ease-in-out infinite; }
    .rise { animation: rise 420ms cubic-bezier(0.22,1,0.36,1) both; }
    @media (prefers-reduced-motion: reduce) { .ground, .rise { animation: none; } }
  </style>
</helmet>

<div style="width: 1440px; height: 900px; position: relative; overflow: hidden; background: #0b0c0c;">
  <div class="ground" style="position: absolute; inset: -8%; background:
      radial-gradient(880px 620px at 12% 4%, rgba(158,232,125,0.13), transparent 62%),
      radial-gradient(820px 600px at 82% 10%, rgba(150,168,172,0.15), transparent 60%),
      radial-gradient(760px 720px at 58% 104%, rgba(120,140,128,0.11), transparent 64%),
      radial-gradient(520px 420px at 96% 78%, rgba(158,232,125,0.07), transparent 60%);"></div>
  <div style="position: absolute; inset: 0; opacity: 0.038; background-image: radial-gradient(#ffffff 0.5px, transparent 0.5px); background-size: 3px 3px;"></div>
  <div style="position: relative; height: 100%; display: flex;">
'''

TAIL = '''  </div>
</div>
</x-dc>
'''

MARK = '''<span style="width: 22px; height: 22px; border-radius: 7px; background: linear-gradient(150deg, #9ee87d, #4e8f5e); box-shadow: 0 0 20px rgba(158,232,125,0.34), inset 0 1px 0 rgba(255,255,255,0.35); flex-shrink: 0;"></span>'''

def write(name, body, script):
    with open(name, 'w') as f:
        f.write(HEAD + body + TAIL + script + '\n</body>\n</html>\n')
    print(name, 'written')
