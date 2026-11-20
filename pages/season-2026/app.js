/* Mauritania 2026 season review: renders data.json (built by scripts/season_2026/build.py). */
(async function () {
  const [D, G1, G2] = await Promise.all(
    ["data.json", "adm1.json", "adm2.json"].map((f) => fetch(f).then((r) => r.json())));

  const Y = D.year, YEARS = D.years, BAD = new Set(D.bad_years), SOUTH = new Set(D.south);
  const SC = ["#e2e8e8", "#eb9f63", "#d9762f", "#b04f14", "#73300c"];
  const SCL = ["under 2 (normal or better)", "2 to 3", "3 to 5", "5 to 10", "10 or more"];
  const NA_FILL = "#f5f7f7", ACC = "#b04f14", BADC = "#7e8e8f", OTH = "#c8d0d1";
  const SCOPE_NAME = { national: "National", south: "Southern belt", guidimakha: "Guidimakha" };
  let scope = "south", curveScope = "south";

  // ---------------------------------------------------------------- helpers
  const cls = (rp) => (rp == null ? null : rp < 2 ? 0 : rp < 3 ? 1 : rp < 5 ? 2 : rp < 10 ? 3 : 4);
  const fmtRP = (rp) => (rp == null ? "–" : "1-in-" + (Number.isInteger(rp) ? rp : rp.toFixed(1)));
  const ord = (n) => { n = Math.round(n); const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const ordR = (r) => (Number.isInteger(r) ? ord(r) : "joint " + ord(Math.floor(r)));
  const sgn = (v, d) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d);
  const ser = (o) => YEARS.map((y) => ({ y, v: o[y] == null ? null : +o[y] }));
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const chip = (c) => `<span class="chip" style="background:${c}"></span>`;
  const rpCell = (rp) => `<span class="rp">${chip(rp == null ? NA_FILL : SC[cls(rp)])}${fmtRP(rp)}</span>`;

  const tip = d3.select("#tip");
  function showTip(ev, html) { tip.html(html).style("display", "block"); moveTip(ev); }
  function moveTip(ev) {
    const n = tip.node(), w = n.offsetWidth, h = n.offsetHeight;
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 14;
    if (y + h > innerHeight - 8) y = ev.clientY - h - 14;
    tip.style("left", x + "px").style("top", y + "px");
  }
  const hideTip = () => tip.style("display", "none");

  // indicator registry: how to read each one per scope
  const IND = {
    rain: { name: "Rainfall, Jul–Sep", worst: "driest",
      s: (sc) => D.rain.scopes[sc].series_jas, fmt: (v) => v.toFixed(0) + " mm" },
    biomass: { name: "Biomass", worst: "lowest",
      s: (sc) => D.biomass.scopes[sc].series_ratio, fmt: (v) => Math.round(v * 100) + "% of trend" },
    vhi: { name: "Crop vegetation (VHI)", worst: "lowest",
      s: (sc) => D.vhi.scopes[sc].series, fmt: (v) => "VHI " + v.toFixed(2) + " (trend-adjusted)" },
    zfparc: { name: "Rangeland vegetation", worst: "lowest",
      s: (sc) => D.pastoral.zfparc.scopes[sc].series, fmt: (v) => "z " + sgn(v, 2) + " (trend-adjusted)" },
    temp: { name: "Heat, Jul–Sep", worst: "hottest",
      s: (sc) => D.temp.scopes[sc].series_anom, fmt: (v) => sgn(v, 2) + " °C vs trend" },
  };

  // ---------------------------------------------------------------- lead + summary
  function lead() {
    const s = "south", g = "guidimakha";
    const rk = {
      rain: D.rain.scopes[s].jas.rank, bio: D.biomass.scopes[s].detrended.rank,
      vhi: D.vhi.scopes[s].detrended.rank, z: D.pastoral.zfparc.scopes[s].detrended.rank,
      t: D.temp.scopes[s].detrended.rank };
    const worstN = Math.ceil(Math.max(...Object.values(rk)));
    const veg = [D.biomass.scopes[s].detrended.rp, D.vhi.scopes[s].detrended.rp, D.pastoral.zfparc.scopes[s].detrended.rp];
    const w2 = D.rain.window2, w26 = w2.years[Y];
    const crossed = w2.labels.filter((_, i) => w26.below[i]);
    const past = w2.fired.filter((y) => y !== Y);
    const gr = D.rain.scopes[g].jas;
    d3.select("#lead").html(
      `<p><b>A severe season for rain and heat, a moderate one for vegetation.</b> In the southern belt 2026 is among the
       ${worstN} worst of ${YEARS.length} seasons since ${YEARS[0]} on all five indicators: July–September rain was the
       ${ordR(rk.rain)} lowest (${fmtRP(D.rain.scopes[s].jas.rp)}) and the season the ${ordR(rk.t)} hottest
       (${fmtRP(D.temp.scopes[s].detrended.rp)}). Against their greening trend, biomass, crop and rangeland vegetation were
       ${fmtRP(Math.min(...veg))} to ${fmtRP(Math.max(...veg))}; against the plain average they were close to normal.
       October rain narrowed the deficit (June–October ${fmtRP(D.rain.scopes[s].jjaso.rp)}).</p>
       <p><b>Guidimakha:</b> July–September rain ${gr.pct}% of average, the ${ordR(gr.rank)} lowest since ${YEARS[0]}
       (${fmtRP(gr.rp)}). <b>Window 2</b> (national rain since 1 July): on today's CHIRPS, 2026 is below the thresholds of
       ${crossed.join(" and ")}. Since 2001 only ${past.slice(0, -1).join(", ")} and ${past.slice(-1)} had crossed them, all
       framework bad years.</p>`);
  }

  function summary() {
    const det = (o, word) => o ? `${ordR(o.detrended.rank)} ${word} vs trend` : "";
    const rows = [
      ["Rainfall, July–September", "CHIRPS", (sc) => { const o = D.rain.scopes[sc].jas;
        return [o.rp, `${ordR(o.rank)} driest of ${o.n} · ${o.pct}% of average`]; }, true],
      ["Rainfall, June–October", "CHIRPS; October preliminary", (sc) => { const o = D.rain.scopes[sc].jjaso;
        return [o.rp, `${ordR(o.rank)} driest · ${o.pct}% of average`]; }, true],
      ["Biomass, 1 April – 30 September", "GeoSahel (DMP)", (sc) => { const o = D.biomass.scopes[sc];
        return [o.detrended.rp, `${det(o, "lowest")} (${Math.round(o.detrended.value * 100)}% of trend) · ${o.raw.pct}% of plain average`]; }],
      ["Crop vegetation health", "FAO ASIS, cropland VHI", (sc) => { const o = D.vhi.scopes[sc];
        return [o.detrended.rp, `${det(o, "lowest")} · plain ranking ${ordR(o.raw.rank)} (${fmtRP(o.raw.rp)})`]; }],
      ["Rangeland vegetation", "JRC ASAP, zFPARc", (sc) => { const o = D.pastoral.zfparc.scopes[sc];
        return [o.detrended.rp, `${det(o, "lowest")} · plain ranking ${ordR(o.raw.rank)} (${fmtRP(o.raw.rp)})`]; }],
      ["Surface water, October", "GeoSahel; record from 2020", (sc) => { const o = D.pastoral.water.scopes[sc];
        return [null, `${ord(o.rank)} lowest of ${o.n} Octobers`, `${o.pct}% of 2020–25`]; }],
      ["Temperature, July–September", "ECMWF via JRC ASAP", (sc) => { const o = D.temp.scopes[sc].detrended;
        return [o.rp, `${ordR(o.rank)} hottest · ${sgn(o.anom, 1)} °C vs trend`]; }],
    ];
    let h = `<thead><tr><th>Indicator</th><th>National</th><th>Southern belt</th><th>Guidimakha</th></tr></thead><tbody>`;
    for (const [name, src, f, nat] of rows) {
      h += `<tr><td><b>${name}</b><span class="det">${src}</span></td>`;
      for (const sc of ["national", "south", "guidimakha"]) {
        if (sc === "national" && !nat) { h += `<td class="na">–</td>`; continue; }
        const [rp, d, alt] = f(sc);
        h += `<td>${alt ? `<span class="rp">${alt}</span>` : rpCell(rp)}<span class="det">${d}</span></td>`;
      }
      h += "</tr>";
    }
    d3.select("#sumTable").html(h + "</tbody>");
    const leg = SC.map((c, i) => `<span>${chip(c)}${SCL[i]}</span>`).join("");
    d3.select("#rpLegend").html(`<span><b>Return period</b></span>${leg}`);
    d3.selectAll(".rpleg").html(`<span>Return period:</span>${leg}<span>${chip(NA_FILL)}not assessed</span>
      <span><span class="chip" style="background:#fff;border:2px solid #1f2324"></span>Guidimakha</span>`);
    d3.selectAll(".barleg").html(`<span>${chip(ACC)}${Y}</span><span>${chip(BADC)}framework bad year</span>
      <span>${chip(OTH)}other year</span>`);
  }

  // ---------------------------------------------------------------- heatmap
  function heat() {
    const keys = Object.keys(IND), cw = 31, ch = 30, lw = 158, top = 40;
    const W = lw + cw * YEARS.length + 6, H = top + ch * keys.length + 4;
    d3.select("#heatTitle").text(`${SCOPE_NAME[scope]}: rank of every season since ${YEARS[0]}, by indicator`);
    const el = d3.select("#heat").html(""), svg = el.append("svg").attr("viewBox", `0 0 ${W} ${H}`)
      .attr("role", "img").attr("aria-label", "Rank of each season by indicator");
    YEARS.forEach((y, j) => {
      const x = lw + j * cw + cw / 2;
      svg.append("text").attr("x", x).attr("y", 14).attr("text-anchor", "middle").attr("font-size", 10.5)
        .attr("fill", y === Y ? "#1f2324" : "#5e6a6b").attr("font-weight", y === Y ? 700 : 400).text("’" + String(y).slice(2));
      if (BAD.has(y)) svg.append("text").attr("x", x).attr("y", 30).attr("text-anchor", "middle")
        .attr("font-size", 10).attr("fill", "#5e6a6b").text("▲");
    });
    keys.forEach((k, i) => {
      const yy = top + i * ch, rk = D.ranks[scope][k], vals = IND[k].s(scope);
      svg.append("text").attr("x", lw - 8).attr("y", yy + ch / 2 + 4).attr("text-anchor", "end")
        .attr("font-size", 12.5).attr("fill", "#1f2324").text(IND[k].name);
      YEARS.forEach((y, j) => {
        const v = rk[y]; if (!v) return;
        const [r, rp] = v, c = SC[cls(rp)], x = lw + j * cw;
        const g = svg.append("g").style("cursor", "default");
        g.append("rect").attr("x", x + 1).attr("y", yy + 1).attr("width", cw - 2).attr("height", ch - 2)
          .attr("rx", 3).attr("fill", c);
        g.append("text").attr("x", x + cw / 2).attr("y", yy + ch / 2 + 4).attr("text-anchor", "middle")
          .attr("font-size", 11).attr("fill", cls(rp) >= 3 ? "#fff" : "#1f2324")
          .text(Number.isInteger(r) ? r : Math.floor(r) + "=");
        g.on("mousemove", (ev) => showTip(ev, `<b>${y}${BAD.has(y) ? " · framework bad year" : ""}</b><br>${IND[k].name}:
            ${ordR(r)} ${IND[k].worst} of ${YEARS.length}<br>Return period ${fmtRP(rp)}<br>${vals[y] == null ? "" : IND[k].fmt(vals[y])}`))
          .on("mouseleave", hideTip);
      });
    });
    const j = YEARS.indexOf(Y);
    svg.append("rect").attr("x", lw + j * cw).attr("y", top - 1).attr("width", cw).attr("height", ch * keys.length + 2)
      .attr("fill", "none").attr("stroke", "#1f2324").attr("stroke-width", 2).attr("rx", 4);
  }

  // ---------------------------------------------------------------- year bars
  function yearBars(sel, rows, o) {
    // rows: [{y, v}], o: {base, ref, fmt, axisFmt, label, rankKey, colorBad=true, height}
    const W = o.width || 560, H = o.height || 210, m = { t: 14, r: 10, b: 24, l: 46 };
    const el = d3.select(sel).html(""), svg = el.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const data = rows.filter((d) => d.v != null);
    const x = d3.scaleBand().domain(rows.map((d) => d.y)).range([m.l, W - m.r]).padding(0.18);
    const ext = d3.extent([...data.map((d) => d.v), o.base, ...(o.ref != null ? [o.ref] : [])]);
    const pad = (ext[1] - ext[0]) * 0.06;
    const lo = o.base === 0 && ext[0] >= 0 ? 0 : ext[0] - pad;
    const y = d3.scaleLinear().domain([lo, ext[1] + pad]).nice().range([H - m.b, m.t]);
    svg.append("g").attr("class", "grid").selectAll("line").data(y.ticks(4)).join("line")
      .attr("x1", m.l).attr("x2", W - m.r).attr("y1", y).attr("y2", y);
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(4).tickSize(0).tickPadding(6).tickFormat(o.axisFmt)).call((g) => g.select(".domain").remove());
    const ticks = rows.map((d) => d.y).filter((yy) => o.allTicks || (yy % 5 === 0 && yy < Y - 2) || yy === Y);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).tickValues(ticks).tickSize(0).tickPadding(6)).call((g) => g.select(".domain").remove());
    svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(o.base)).attr("y2", y(o.base))
      .attr("stroke", "#7e8e8f").attr("stroke-width", 1);
    if (o.ref != null && o.ref !== o.base) {
      svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(o.ref)).attr("y2", y(o.ref))
        .attr("stroke", "#5e6a6b").attr("stroke-dasharray", "4 3");
      svg.append("text").attr("x", W - m.r).attr("y", y(o.ref) - 4).attr("text-anchor", "end").attr("font-size", 10.5)
        .attr("fill", "#5e6a6b").text(o.refLabel || "average");
    }
    const col = (d) => (d.y === Y ? ACC : o.colorBad !== false && BAD.has(d.y) ? BADC : OTH);
    if (o.missingNote && !data.some((d) => d.y === Y)) {
      svg.append("text").attr("x", x(Y) + x.bandwidth()).attr("y", y(o.base) - 6).attr("text-anchor", "end")
        .attr("font-size", 10.5).attr("fill", ACC).text(o.missingNote);
    }
    svg.append("g").selectAll("path").data(data).join("path")
      .attr("d", (d) => { // bar with 2px rounded data end, square at the baseline
        const x0 = x(d.y), w = x.bandwidth(), yb = y(o.base), yv = y(d.v), up = yv < yb, r = Math.min(2, Math.abs(yb - yv));
        return up ? `M${x0},${yb}V${yv + r}Q${x0},${yv} ${x0 + r},${yv}H${x0 + w - r}Q${x0 + w},${yv} ${x0 + w},${yv + r}V${yb}Z`
                  : `M${x0},${yb}V${yv - r}Q${x0},${yv} ${x0 + r},${yv}H${x0 + w - r}Q${x0 + w},${yv} ${x0 + w},${yv - r}V${yb}Z`;
      })
      .attr("fill", col);
    svg.append("g").selectAll("rect").data(data).join("rect")
      .attr("x", (d) => x(d.y) - x.step() * x.padding() / 2).attr("width", x.step()).attr("y", m.t).attr("height", H - m.b - m.t)
      .attr("fill", "transparent")
      .on("mousemove", (ev, d) => {
        const rk = o.rankKey ? D.ranks[scope][o.rankKey][d.y] : null;
        showTip(ev, `<b>${d.y}${BAD.has(d.y) && o.colorBad !== false ? " · framework bad year" : ""}</b><br>${o.fmt(d.v)}` +
          (rk ? `<br>${ordR(rk[0])} ${IND[o.rankKey].worst} of ${YEARS.length} · ${fmtRP(rk[1])}` : "") +
          (o.extra ? o.extra(d.y) : ""));
      }).on("mouseleave", hideTip);
  }

  const MON = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const zDate = () => { const [mm, dd] = D.pastoral.zfparc.dekad.split("-"); return `${+dd} ${MON[+mm]}`; };

  function bars() {
    const sc = scope, nm = SCOPE_NAME[sc];
    // rain
    const rs = D.rain.scopes[sc].series_jas, rref = mean(YEARS.filter((y) => y < Y).map((y) => rs[y]));
    d3.select("#barsRainHead").text(`${nm}: July–September rainfall by season (mm)`);
    yearBars("#barsRain", ser(rs), { base: 0, ref: rref, refLabel: "2001–2025 average", rankKey: "rain",
      fmt: (v) => `${v.toFixed(0)} mm (${Math.round(100 * v / rref)}% of average)`, axisFmt: (v) => v, width: 940, height: 190 });
    // biomass
    const b = D.biomass.scopes[sc];
    d3.select("#barsBioHead").text(`${nm}: biomass to 30 September, % of trend`);
    yearBars("#barsBio", ser(b.series_ratio).map((d) => ({ y: d.y, v: d.v == null ? null : d.v * 100 })),
      { base: 100, rankKey: "biomass", fmt: (v) => `${Math.round(v)}% of trend`, axisFmt: (v) => v + "%",
        extra: (yy) => `<br>${Math.round(b.series_pct[yy])}% of plain 2001–2025 average` });
    d3.select("#bioCap").text(`Bars go down when biomass is below the trend line. Biomass has risen by about
      ${Math.round(b.trend_pct_per_decade)}% per decade here, so ${Y} at ${b.raw.pct}% of the plain 2001–2025 average is
      ${Math.round(b.detrended.value * 100)}% of what the trend expects.`);
    // VHI
    const v = D.vhi.scopes[sc], vref = mean(YEARS.filter((y) => y < Y).map((y) => v.series[y]));
    d3.select("#barsVhiHead").text(`${nm}: cropland vegetation health (VHI), season mean, trend-adjusted`);
    yearBars("#barsVhi", ser(v.series), { base: vref, rankKey: "vhi", fmt: (x) => `VHI ${x.toFixed(2)} (trend-adjusted)`,
      axisFmt: (x) => x.toFixed(2), extra: (yy) => `<br>Without trend adjustment: ${(+v.series_raw[yy]).toFixed(2)}` });
    d3.select("#vhiCap").text(`Bars from the 2001–2025 average; VHI runs from 0 (poor) to 1 (good). Without the trend
      adjustment ${Y} ranks ${ordR(v.raw.rank)} lowest (${fmtRP(v.raw.rp)}).`);
    // ASI official
    const asi = sc === "south" ? D.vhi.asi_official.national : D.vhi.asi_official.guidimakha;
    yearBars("#asiBars", YEARS.map((y) => ({ y, v: asi[y] == null ? null : +asi[y] })),
      { base: 0, fmt: (x) => `${x.toFixed(1)}% of cropland stressed`, axisFmt: (x) => x + "%", width: 940, height: 170,
        missingNote: `${Y}: not yet published` });
    d3.select("#asiCap").text(`${sc === "south" ? "Mauritania (FAO's national value, the eight wilayas)" : "Guidimakha"};
      FAO publishes the annual value after the season, the latest is ${D.vhi.asi_official.last_year}. Most years sit near zero, so
      the index separates only the worst seasons.`);
    // rangeland
    const z = D.pastoral.zfparc.scopes[sc], zref = mean(YEARS.filter((y) => y < Y).map((y) => z.series[y]));
    d3.select("#barsZHead").text(`${nm}: rangeland vegetation to ${zDate()} (ASAP zFPARc), trend-adjusted`);
    yearBars("#barsZ", ser(z.series), { base: zref, rankKey: "zfparc", fmt: (x) => `z ${sgn(x, 2)} (trend-adjusted)`,
      axisFmt: (x) => x.toFixed(1), extra: (yy) => `<br>ASAP's own z-score: ${sgn(+z.series_raw[yy], 2)}` });
    d3.select("#zCap").text(`Cumulative vegetation on rangeland since the start of the season. ASAP's own z-score for
      ${Y} is ${sgn(z.raw.value, 2)} (${ordR(z.raw.rank)} lowest); against the trend it is ${ordR(z.detrended.rank)} lowest.`);
    // water
    const w = D.pastoral.water.scopes[sc], wy = D.pastoral.water.years;
    const wref = mean(D.pastoral.water.ref.map((y) => w.series[y]));
    d3.select("#barsWHead").text(`${nm}: surface water in October (km²)`);
    yearBars("#barsW", wy.map((y) => ({ y, v: w.series[y] })), { base: 0, ref: wref, refLabel: "2020–2025 average",
      colorBad: false, allTicks: true, fmt: (x) => `${x.toFixed(sc === "south" ? 0 : 1)} km²`, axisFmt: (x) => x, height: 190 });
    // temperature
    const t = D.temp.scopes[sc];
    d3.select("#barsTHead").text(`${nm}: July–September temperature, °C above or below trend`);
    yearBars("#barsT", ser(t.series_anom), { base: 0, rankKey: "temp", fmt: (x) => `${sgn(x, 2)} °C vs trend`,
      axisFmt: (x) => sgn(x, 1) });
    d3.select("#tCap").text(`Trend +${t.trend_c_per_decade.toFixed(2)} °C per decade (1989–2025). Without removing it, ${Y}
      is ${sgn(t.raw.anom, 1)} °C above the 2001–2025 average, ${ordR(t.raw.rank)} hottest.`);
  }

  // ---------------------------------------------------------------- rainfall curve
  const DK = ["1 Jul", "11 Jul", "21 Jul", "1 Aug", "11 Aug", "21 Aug", "1 Sep", "11 Sep", "21 Sep", "1 Oct", "11 Oct", "21 Oct"];
  function curve() {
    const sc = curveScope, C = D.rain.curves[sc], W = 560, H = 300, m = { t: 14, r: 64, b: 26, l: 44 };
    const past = YEARS.filter((y) => y < Y), n = DK.length;
    const env = d3.range(n).map((i) => { const v = past.map((y) => C[y][i]);
      return { i, lo: d3.min(v), hi: d3.max(v), mu: mean(v) }; });
    const jas = D.rain.scopes[sc].series_jas;
    const driest = past.reduce((a, y) => (jas[y] < jas[a] ? y : a), past[0]);
    const x = d3.scaleLinear().domain([0, n - 1]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([0, d3.max(env, (d) => d.hi) * 1.04]).nice().range([H - m.b, m.t]);
    const el = d3.select("#curve").html(""), svg = el.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    svg.append("g").attr("class", "grid").selectAll("line").data(y.ticks(5)).join("line")
      .attr("x1", m.l).attr("x2", W - m.r).attr("y1", y).attr("y2", y);
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(5).tickSize(0).tickPadding(6)).call((g) => g.select(".domain").remove());
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).tickValues([0, 3, 6, 9]).tickFormat((i) => ["Jul", "Aug", "Sep", "Oct"][i / 3]).tickSize(0).tickPadding(6))
      .call((g) => g.select(".domain").remove());
    svg.append("text").attr("x", m.l).attr("y", m.t - 3).attr("font-size", 10.5).attr("fill", "#5e6a6b").text("mm");
    svg.append("path").datum(env).attr("fill", "#ebeff0")
      .attr("d", d3.area().x((d) => x(d.i)).y0((d) => y(d.lo)).y1((d) => y(d.hi)));
    const ln = d3.line().defined((d) => d != null).x((d, i) => x(i)).y((d) => y(d));
    svg.append("path").datum(env.map((d) => d.mu)).attr("fill", "none").attr("stroke", "#5e6a6b")
      .attr("stroke-width", 1.5).attr("stroke-dasharray", "5 4").attr("d", ln);
    svg.append("path").datum(C[driest]).attr("fill", "none").attr("stroke", "#3f4748").attr("stroke-width", 1.2).attr("d", ln);
    const c26 = C[Y], lastFinal = 8; // 21 Sep is the last final dekad; October preliminary
    svg.append("path").datum(c26.map((v, i) => (i <= lastFinal ? v : null))).attr("fill", "none").attr("stroke", ACC)
      .attr("stroke-width", 2.5).attr("d", ln);
    svg.append("path").datum(c26.map((v, i) => (i >= lastFinal ? v : null))).attr("fill", "none").attr("stroke", ACC)
      .attr("stroke-width", 2.5).attr("stroke-dasharray", "3 3").attr("d", ln);
    const lab = (v, txt, col, dy) => svg.append("text").attr("x", W - m.r + 5).attr("y", y(v) + 4 + (dy || 0))
      .attr("font-size", 11).attr("fill", col).attr("font-weight", col === ACC ? 700 : 400).text(txt);
    const endMu = env[n - 1].mu, endD = C[driest][n - 1], end26 = c26[n - 1];
    const ys = [[end26, String(Y), ACC], [endMu, "average", "#5e6a6b"], [endD, String(driest), "#3f4748"]]
      .sort((a, b) => b[0] - a[0]);
    let prev = -1e9; // nudge end labels apart
    ys.forEach(([v, t, c]) => { let py = y(v); if (py - prev < 13) py = prev + 13; prev = py; lab(y.invert(py), t, c); });
    let th = null;
    if (sc === "national") {
      th = D.rain.window2.thresholds.map((t, k) => ({ i: k + 1, t }));
      svg.append("g").selectAll("path").data(th).join("path")
        .attr("transform", (d) => `translate(${x(d.i)},${y(d.t)})`).attr("d", d3.symbol(d3.symbolDiamond, 46))
        .attr("fill", "#1f2324").attr("stroke", "#fff").attr("stroke-width", 1.5);
    }
    // hover crosshair
    const hl = svg.append("line").attr("y1", m.t).attr("y2", H - m.b).attr("stroke", "#7e8e8f").style("display", "none");
    const dot = svg.append("circle").attr("r", 4.5).attr("fill", ACC).attr("stroke", "#fff").attr("stroke-width", 2).style("display", "none");
    svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b)
      .attr("fill", "transparent")
      .on("mousemove", (ev) => {
        const [mx] = d3.pointer(ev), i = Math.max(0, Math.min(n - 1, Math.round(x.invert(mx))));
        hl.attr("x1", x(i)).attr("x2", x(i)).style("display", null);
        dot.attr("cx", x(i)).attr("cy", y(c26[i])).style("display", null);
        const t = th && th.find((d) => d.i === i);
        showTip(ev, `<b>Rain 1 July – end of dekad starting ${DK[i]}</b>${i > lastFinal ? " (preliminary)" : ""}<br>
          ${Y}: ${c26[i].toFixed(0)} mm<br>2001–2025 average: ${env[i].mu.toFixed(0)} mm (range ${env[i].lo.toFixed(0)}–${env[i].hi.toFixed(0)})<br>
          ${driest}: ${C[driest][i].toFixed(0)} mm` + (t ? `<br>Window 2 threshold: ${t.t} mm` : ""));
      })
      .on("mouseleave", () => { hl.style("display", "none"); dot.style("display", "none"); hideTip(); });
    d3.select("#curveLegend").html(`<span><span class="chip" style="background:${ACC}"></span>${Y} (dashed: October, preliminary)</span>
      <span><span class="chip" style="background:#5e6a6b;height:3px"></span>2001–2025 average</span>
      <span>${chip("#ebeff0")}2001–2025 range</span><span><span class="chip" style="background:#3f4748;height:2px"></span>${driest}, driest July–September since 2001</span>` +
      (th ? `<span>◆ Window 2 threshold</span>` : ""));
    const jr = D.rain.scopes[sc].jas;
    d3.select("#curveCap").text(sc === "national"
      ? `Average over all of Mauritania, the framework's trigger area. Window 2 thresholds apply from 11 July to 31 August.`
      : `${SCOPE_NAME[sc]}: July–September ${jr.pct}% of the 2001–2025 average, ${ordR(jr.rank)} driest since 2001.`);
  }

  // ---------------------------------------------------------------- maps
  const southGeo = { type: "FeatureCollection", features: G1.features.filter((f) => SOUTH.has(f.properties.code)) };
  function map(sel, opts) {
    // opts: {level: 1|2, fit: 'south'|'all', val: code -> {fill, tip} | null}
    const W = 420, H = opts.fit === "all" ? 430 : 300;
    const proj = d3.geoMercator().fitExtent([[6, 6], [W - 6, H - 6]], opts.fit === "all" ? G1 : southGeo);
    const path = d3.geoPath(proj);
    const el = d3.select(sel).html(""), svg = el.append("svg").attr("viewBox", `0 0 ${W} ${H}`)
      .attr("role", "img").attr("aria-label", opts.aria || "map");
    const draw = (feats, isUnit) => svg.append("g").selectAll("path").data(feats).join("path").attr("d", path)
      .attr("fill", (f) => { const v = isUnit && opts.val(f.properties.code); return v ? v.fill : NA_FILL; })
      .attr("stroke", "#fff").attr("stroke-width", isUnit && opts.level === 2 ? 0.6 : 1)
      .on("mousemove", (ev, f) => { const v = isUnit && opts.val(f.properties.code);
        showTip(ev, `<b>${f.properties.name}</b>${opts.level === 2 && isUnit ? ` (${D.names1[f.properties.adm1]})` : ""}<br>${v ? v.tip : "not assessed"}`); })
      .on("mouseleave", hideTip);
    if (opts.level === 2) {
      draw(G1.features.filter((f) => !SOUTH.has(f.properties.code)), false);
      draw(G2.features, true);
      svg.append("g").selectAll("path").data(southGeo.features).join("path").attr("d", path)
        .attr("fill", "none").attr("stroke", "#5e6a6b").attr("stroke-width", 0.9).style("pointer-events", "none");
    } else {
      draw(G1.features, true);
    }
    const gd = G1.features.find((f) => f.properties.code === D.guidimakha);
    svg.append("path").datum(gd).attr("d", path).attr("fill", "none").attr("stroke", "#1f2324").attr("stroke-width", 2)
      .style("pointer-events", "none");
    // light labels for the southern wilayas
    southGeo.features.forEach((f) => {
      const [[x0, y0], [x1, y1]] = path.bounds(f), [cx, cy] = path.centroid(f);
      if (x1 - x0 < 34 || y1 - y0 < 18) return;
      svg.append("text").attr("x", cx).attr("y", cy).attr("text-anchor", "middle").attr("font-size", 9.5)
        .attr("fill", "#1f2324").attr("paint-order", "stroke").attr("stroke", "rgba(255,255,255,.85)").attr("stroke-width", 2.5)
        .style("pointer-events", "none").text(D.names1[f.properties.code].replace("Hodh ", "H. "));
    });
  }
  const rpFill = (o) => (o && o.rp != null ? SC[cls(o.rp)] : null);

  function maps() {
    map("#mapRain", { level: 1, fit: "all", aria: "July to September rainfall return period by wilaya",
      val: (c) => { const o = D.rain.units[c]; if (!o || o.rp == null) return null;
        return { fill: rpFill(o), tip: `Jul–Sep ${o.value.toFixed(0)} mm, ${o.pct}% of average<br>${ordR(o.rank)} driest since 2001 · ${fmtRP(o.rp)}` +
          (o.mean < 60 ? "<br><i>Arid: average under 60 mm</i>" : "") }; } });
    map("#mapBio", { level: 2, fit: "south", aria: "Biomass return period by moughataa",
      val: (c) => { const o = D.biomass.adm2[c];
        if (!o) return D.biomass.adm2_arid.includes(c) ? { fill: NA_FILL, tip: "Arid: too little biomass to rank" } : null;
        return { fill: rpFill(o.detrended), tip: `${Math.round(o.detrended.value * 100)}% of trend · ${o.raw.pct}% of plain average<br>
          ${ordR(o.detrended.rank)} lowest vs trend · ${fmtRP(o.detrended.rp)}` }; } });
    const adm1Map = (sel, src, fmt, word) => map(sel, { level: 1, fit: "south",
      val: (c) => { const o = src[c]; if (!o) return null; const d = o.detrended;
        return { fill: rpFill(d), tip: `${fmt(o)}<br>${ordR(d.rank)} ${word} vs trend · ${fmtRP(d.rp)}` }; } });
    adm1Map("#mapVhi", D.vhi.adm1, (o) => `VHI ${o.raw.value.toFixed(2)}; plain ranking ${ordR(o.raw.rank)}`, "lowest");
    adm1Map("#mapZ", D.pastoral.zfparc.adm1, (o) => `ASAP z ${sgn(o.raw.value, 2)}; plain ranking ${ordR(o.raw.rank)}`, "lowest");
    adm1Map("#mapT", D.temp.adm1, (o) => `${sgn(o.detrended.anom, 2)} °C vs trend`, "hottest");
    // surface water: % of 2020-25 October average
    const WC = ["#73300c", "#b04f14", "#d9762f", "#eb9f63", "#e2e8e8"], WL = ["under 50%", "50–65%", "65–80%", "80–100%", "100% or more"];
    const wcls = (p) => (p < 50 ? 0 : p < 65 ? 1 : p < 80 ? 2 : p < 100 ? 3 : 4);
    map("#mapW", { level: 2, fit: "south", aria: "October 2026 surface water by moughataa",
      val: (c) => { const o = D.pastoral.water.adm2[c]; if (!o) return null;
        return { fill: WC[wcls(o.pct)], tip: `${o.pct}% of the 2020–25 October average<br>${ord(o.rank)} lowest of ${o.n} Octobers` }; } });
    d3.select("#wLegend").html(WL.map((l, i) => `<span>${chip(WC[i])}${l}</span>`).join("") +
      `<span>${chip(NA_FILL)}little or no open water / not assessed</span>`);
  }

  // ---------------------------------------------------------------- sources + meta
  function sources() {
    const li = [
      `<b>CHIRPS rainfall</b> by wilaya: WFP, <a href="https://data.humdata.org/dataset/mrt-rainfall-subnational">HDX</a>; final to the dekad of ${D.rain.last_final}, preliminary to ${D.rain.last}.`,
      `<b>Biomass</b> and <b>surface water</b>: <a href="https://geosahel.info">GeoSahel</a> (Action contre la Faim; Copernicus DMP), biomass to dekad ${D.biomass.last_dekad} of ${Y}, water to October ${Y}.`,
      `<b>ASI and vegetation health</b>: <a href="https://www.fao.org/giews/earthobservation/country/index.jsp?code=MRT&lang=en">FAO GIEWS ASIS</a>, dekadal VHI to ${D.vhi.last}; annual ASI to ${D.vhi.asi_official.last_year}.`,
      `<b>Rangeland vegetation and temperature</b>: <a href="https://agricultural-production-hotspots.ec.europa.eu">JRC ASAP</a> indicator statistics (zFPARc on rangeland; ECMWF temperature).`,
      `<b>Bad years</b>: the framework's nine worst years since 2001 (Annex 1, <a href="https://reliefweb.int/report/mauritania/cadre-de-laction-anticipatoire-secheresse-en-mauritanie-17-avril-2026">Mauritania drought AA framework, 17 April 2026</a>).`,
      `<b>Boundaries</b>: COD-AB Mauritania v03, <a href="https://data.humdata.org/dataset/cod-ab-mrt">HDX</a>.`,
    ];
    d3.select("#srcList").html(li.map((x) => `<li>${x}</li>`).join(""));
    const rl = D.rain.scopes;
    d3.select("#longRain").text(`national ${ordR(rl.national.jas.rank_long)} of ${rl.national.jas.n_long} (${fmtRP(rl.national.jas.rp_long)}),
      southern belt ${ordR(rl.south.jas.rank_long)} (${fmtRP(rl.south.jas.rp_long)}), Guidimakha ${ordR(rl.guidimakha.jas.rank_long)} (${fmtRP(rl.guidimakha.jas.rp_long)})`);
    const ec = Object.entries(D.rain.ecmwf_check);
    d3.select("#ecmwf").text(ec.map(([c, o]) => `${D.names1[c]} ${o.ecmwf_pct}% vs ${o.chirps_pct}%`).join(", "));
    const rr = ec.map(([, o]) => o.r);
    d3.select("#ecmwfR").text(`${Math.min(...rr).toFixed(2)}–${Math.max(...rr).toFixed(2)}`);
    d3.select("#rho").text(D.vhi.rho_vhi_asi.toFixed(2).replace("-", "−"));
    d3.select("#zDekad").text(`the dekad starting ${zDate()}`);
    d3.select("#meta").html(`Data downloaded and page built ${D.built}. Code: <code>scripts/season_2026/</code> in
      <a href="https://github.com/OCHA-DAP/ds-aa-mrt-drought">OCHA-DAP/ds-aa-mrt-drought</a>. OCHA Centre for Humanitarian Data.`);
  }

  // ---------------------------------------------------------------- controls
  function seg(id, set) {
    d3.selectAll(`#${id} button`).on("click", function () {
      d3.selectAll(`#${id} button`).classed("on", false).attr("aria-pressed", "false");
      d3.select(this).classed("on", true).attr("aria-pressed", "true");
      set(this.dataset.v);
    });
  }
  seg("scopeSeg", (v) => { scope = v; heat(); bars(); });
  seg("curveSeg", (v) => { curveScope = v; curve(); });

  lead(); summary(); heat(); curve(); bars(); maps(); sources();
  // the page is drawn after the data loads, so jump to a #section link only now
  if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
})();
