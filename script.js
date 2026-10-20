const API = "https://mental-health-checkup.onrender.com";   // where your FastAPI server runs
const SCALE_MAX = 10;                  // top of the model's score scale (higher = better)
const BANDS = [                        // [upper limit, label, colour, note]
  [5, "Lower range", "bad", "The model estimates a lower score for these habits. Try the sleep and social media sliders to see what moves it. If you have been struggling, talking to someone you trust can help."],
  [7, "Middle range", "mid", "A middle-of-the-road estimate. Change one habit at a time to see which one shifts the score most."],
  [Infinity, "Higher range", "good", "The model estimates a healthier score for these habits."],
];
const PARTS = [
  { name: "sleep_hours_per_night", key: "sleep", label: "Sleep" },
  { name: "study_hours", key: "study", label: "Study" },
  { name: "avg_daily_usage_hours", key: "social", label: "Social media" },
  { name: "physical_activity_hours", key: "move", label: "Activity" },
];

const $ = (id) => document.getElementById(id);
const form = $("form"), ring = $("ring"), legend = $("legend"), go = $("go"), err = $("err");
const fmt = (h) => `${+h.toFixed(1)} h`;

// Build selects and segmented buttons from data-options ("value:Label" or just "value")
document.querySelectorAll("[data-options]").forEach((el) => {
  const items = el.dataset.options.split(",").map((o) => o.split(":"));
  const def = el.dataset.default ?? items[0][0];
  if (el.tagName === "SELECT") {
    items.forEach(([v, l = v]) => el.add(new Option(l, v)));
    el.value = def;
  } else {
    el.innerHTML = items.map(([v, l = v]) =>
      `<label><input type="radio" name="${el.dataset.name}" value="${v}" ${v === def ? "checked" : ""}><span>${l}</span></label>`).join("");
  }
});

// Sliders: readout + filled track
function sync(r) {
  r.style.setProperty("--p", `${(r.value / r.max) * 100}%`);
  r.closest("label").querySelector("output").textContent = fmt(+r.value);
}

// The 24-hour ring: shows how the day splits as you move the sliders
const C = 2 * Math.PI * 50;
function draw() {
  const hours = PARTS.map((p) => +form[p.name].value);
  const used = hours.reduce((a, b) => a + b, 0);
  const rest = Math.max(0, 24 - used), scale = Math.max(24, used);
  const segs = [...PARTS.map((p, i) => [p.key, p.label, hours[i]]), ["rest", "Everything else", rest]];
  let acc = 0;
  ring.innerHTML = segs.map(([k, , h]) => {
    const len = (h / scale) * C;
    const c = `<circle cx="60" cy="60" r="50" fill="none" stroke="var(--${k})" stroke-width="12" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 60 60)"/>`;
    acc += len;
    return c;
  }).join("") +
    `<text x="60" y="62" font-size="20" font-weight="500">${fmt(Math.max(24, used))}</text>
     <text x="60" y="78" font-size="8" fill="var(--mute)">${used > 24 ? "overlapping" : "in a day"}</text>`;
  legend.innerHTML = segs.map(([k, l, h]) => `<li style="--k:var(--${k})"><span><i></i>${l}</span><b>${fmt(h)}</b></li>`).join("") +
    (used > 24 ? `<li class="warn">These add up to ${fmt(used)}. Overlap is fine, but check the numbers.</li>` : "");
}

form.addEventListener("input", (e) => { if (e.target.type === "range") sync(e.target); draw(); });
form.querySelectorAll("input[type=range]").forEach(sync);
draw();

// API status
function setApi(ok) {
  $("api").dataset.state = ok ? "ok" : "down";
  $("api-text").textContent = ok ? "API connected" : "API offline";
}
fetch(API + "/").then((r) => setApi(r.ok)).catch(() => setApi(false));

function show(score) {
  const [, label, k, note] = BANDS.find((b) => score < b[0]);
  const box = $("result");
  box.style.setProperty("--bc", `var(--${k})`);
  $("score").textContent = score.toFixed(2);
  $("band").textContent = label;
  $("note").textContent = note;
  box.hidden = false;
  $("mark").style.left = "0%";
  void box.offsetWidth;  // restart the marker animation
  $("mark").style.left = `${Math.min(100, Math.max(0, (score / SCALE_MAX) * 100))}%`;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const d = Object.fromEntries(new FormData(form));
  ["age", "daily_unlocks"].forEach((k) => (d[k] = parseInt(d[k], 10)));
  PARTS.forEach((p) => (d[p.name] = parseFloat(d[p.name])));

  go.disabled = true; go.textContent = "Predicting..."; err.hidden = true;
  try {
    const res = await fetch(`${API}/predict`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(Array.isArray(data.detail)
      ? data.detail.map((x) => `${x.loc.at(-1)}: ${x.msg}`).join("; ")
      : `The API returned an error (${res.status}).`);
    setApi(true);
    show(data.predicted_mental_health_status);
  } catch (ex) {
    $("result").hidden = true;
    if (ex instanceof TypeError) {
      setApi(false);
      err.textContent = "Can't reach the API at localhost:8000. Start your FastAPI server (for example: uvicorn main:app --port 8000), then try again.";
    } else err.textContent = ex.message;
    err.hidden = false;
  } finally {
    go.disabled = false; go.textContent = "Predict score";
  }
});
