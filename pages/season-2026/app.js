/* Mauritania 2026 season review: renders data.json (built by scripts/season_2026/build.py). */
(async function () {
  const [D, G1, G2] = await Promise.all(
    ["data.json", "adm1.json", "adm2.json"].map((f) => fetch(f).then((r) => r.json())));

  const Y = D.year, YEARS = D.years, BAD = new Set(D.bad_years), SOUTH = new Set(D.south);
  const SC = ["#e2e8e8", "#eb9f63", "#d9762f", "#b04f14", "#73300c"];
  const SCL = ["under 2 (normal or better)", "2 to 3", "3 to 5", "5 to 10", "10 or more"];
  const NA_FILL = "#f5f7f7", ACC = "#b04f14", BADC = "#7e8e8f", OTH = "#c8d0d1";
  const SCOPE_NAME = { national: "National", south: "Southern belt", guidimakha: "Guidimakha" };
  const CR = D.crops, ZF = D.pastoral.zfparc, WA = D.pastoral.water;
  let scope = "south", curveScope = "south", base = "plain"; // base: vegetation vs plain average or trend

  // ---------------------------------------------------------------- helpers
  const cls = (rp) => (rp == null ? null : rp < 2 ? 0 : rp < 3 ? 1 : rp < 5 ? 2 : rp < 10 ? 3 : 4);
  const fmtRP = (rp) => (rp == null ? "–" : "1-in-" + (Number.isInteger(rp) ? rp : rp.toFixed(1)));
  const ord = (n) => { n = Math.round(n); const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const ordR = (r) => (Number.isInteger(r) ? ord(r) : "joint " + ord(Math.floor(r)));
  const nth = (r, w) => (r === 1 ? w : `${ordR(r)} ${w}`); // "lowest", not "1st lowest"
  const since = (o, w) => (o.since ? `${w || "lowest"} since ${o.since}` : `${w || "lowest"} since 2001`);
  const subFloor = (o) => o.value != null && o.value < CR.asi.floor;
  const sgn = (v, d) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d);
  const ser = (o, f) => YEARS.map((y) => ({ y, v: o[y] == null ? null : f ? f(+o[y]) : +o[y] }));
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const chip = (c) => `<span class="chip" style="background:${c}"></span>`;
  const rpSpan = (rp, small) => `<span class="rp${small ? " sm" : ""}">${chip(rp == null ? NA_FILL : SC[cls(rp)])}${fmtRP(rp)}</span>`;
  const rangeRP = (a) => { const lo = Math.min(...a), hi = Math.max(...a);
    return lo === hi ? fmtRP(lo) : `${fmtRP(lo)} to ${fmtRP(hi)}`; };
  const MON = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const zDate = () => { const [mm, dd] = ZF.dekad.split("-"); return `${+dd} ${MON[+mm]}`; };
  const isTrend = () => base === "trend";
  const baseWord = () => (isTrend() ? "against trend" : "against the 2001–2025 average");

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

  // indicator registry for the rank grid: key in D.ranks, name, worst word, value text
  const IND = () => [
    { k: "rain", name: "Rainfall, Jul–Sep", worst: "driest",
      s: (sc) => D.rain.scopes[sc].series_jas, fmt: (v) => v.toFixed(0) + " mm" },
    isTrend()
      ? { k: "biomass_trend", name: "Biomass (vs trend)", worst: "lowest",
          s: (sc) => D.biomass.scopes[sc].series_ratio, fmt: (v) => Math.round(v * 100) + "% of trend" }
      : { k: "biomass", name: "Biomass", worst: "lowest",
          s: (sc) => D.biomass.scopes[sc].series_pct, fmt: (v) => Math.round(v) + "% of average" },
    { k: "asi", name: "Crop stress (ASI)", worst: "highest",
      s: (sc) => CR.asi.scopes[sc].series, fmt: (v) => v.toFixed(1) + "% of cropland stressed" },
    isTrend()
      ? { k: "zfparc_trend", name: "Rangeland (vs trend)", worst: "lowest",
          s: (sc) => ZF.scopes[sc].series, fmt: (v) => "z " + sgn(v, 2) + " (trend-adjusted)" }
      : { k: "zfparc", name: "Rangeland vegetation", worst: "lowest",
          s: (sc) => ZF.scopes[sc].series_raw, fmt: (v) => "ASAP z " + sgn(v, 2) },
    { k: "temp", name: "Heat, Jul–Sep", worst: "hottest",
      s: (sc) => D.temp.scopes[sc].series_anom, fmt: (v) => sgn(v, 2) + " °C vs trend" },
  ];

  // ---------------------------------------------------------------- lead + summary
  function lead() {
    const s = "south", g = "guidimakha", R = D.rain.scopes, T = D.temp.scopes;
    const bio = D.biomass.scopes[s], vhi = CR.vhi.scopes[s], z = ZF.scopes[s];
    const sinceYrs = [...new Set([bio.raw.since, vhi.raw.since, z.raw.since].map((x) => x || 2001))].sort();
    const stressed = D.south.filter((c) => CR.asi.adm1[c].value >= CR.asi.floor)
      .sort((a, b) => CR.asi.adm1[a].rank - CR.asi.adm1[b].rank)
      .map((c) => { const o = CR.asi.adm1[c], v = o.value;
        return `${D.names1[c]} (${v < 10 ? v.toFixed(1) : Math.round(v)}%, ${nth(o.rank, "highest")} since 2001)`; });
    const gr = R[g].jas, gs = R[g].series_jas;
    const near = YEARS.filter((y) => y !== Y).reduce((a, y) => (Math.abs(gs[y] - gs[Y]) < Math.abs(gs[a] - gs[Y]) ? y : a), YEARS[0]);
    const nearTxt = Math.abs(gs[near] - gs[Y]) < 3 ? `, level with ${near} (${Math.abs(gs[near] - gs[Y]).toFixed(0)} mm apart)` : "";
    const gb = D.biomass.scopes[g], gz = ZF.scopes[g];
    const w2 = D.rain.window2, w26 = w2.years[Y];
    const crossed = w2.labels.map((l, i) => [l, w2.thresholds[i] - w26.cum[i]]).filter((_, i) => w26.below[i]);
    const past = w2.fired.filter((y) => y !== Y);
    const ecG = D.rain.ecmwf_check[D.guidimakha];
    d3.select("#lead").html(
      `<p><b>Severe for rainfall and heat; vegetation below recent years but close to the long-term average.</b>
       In the southern belt, July–September rain was the ${nth(R[s].jas.rank, "lowest")} since 2001 (${fmtRP(R[s].jas.rp)};
       ${nth(R[s].jas.rank_long, "lowest")} since 1981, ${fmtRP(R[s].jas.rp_long)}) and the season the ${ordR(T[s].detrended.rank)}
       hottest (${fmtRP(T[s].detrended.rp)}). October rain, ${R[s].oct.rank_wet === 1 ? "the wettest" : `the ${nth(R[s].oct.rank_wet, "wettest")}`}
       since 2001 (preliminary), narrowed the June–October deficit to ${fmtRP(R[s].jjaso.rp)}.</p>
       <p>Biomass, crop vegetation health and rangeland vegetation were the lowest since ${sinceYrs.join(" or ")}, but close to
       the 2001–2025 average (biomass ${bio.raw.pct}%; ${rangeRP([bio.raw.rp, vhi.raw.rp, z.raw.rp])}). Treating the greener
       years since 2020 as a trend gives ${rangeRP([bio.detrended.rp, vhi.detrended.rp, z.detrended.rp])}. FAO's crop stress
       index stayed under ${CR.asi.floor}% of cropland except in ${stressed.join(", ")}.</p>
       <p><b>Guidimakha:</b> July–September rain ${gr.pct}% of average, the ${nth(gr.rank, "lowest")} since 2001${nearTxt};
       ${nth(gr.rank_long, "lowest")} since 1981 (${fmtRP(gr.rp_long)}). ECMWF rainfall shows a smaller deficit (${ecG.ecmwf_pct}%).
       Biomass ${since(gb.raw)} (${gb.raw.pct}% of average), rangeland ${since(gz.raw)}; little crop stress.</p>
       <p><b>Window 2:</b> the framework had already activated through its forecast window in May. As a check only, today's
       final CHIRPS puts national rain since 1 July below the ${crossed.map(([l, d]) => `${l} threshold (by ${d.toFixed(1)} mm)`).join(" and the ")}.
       Since 2001 only ${past.slice(0, -1).join(", ")} and ${past.slice(-1)} had crossed them, all framework bad years.</p>`);
  }

  function summary() {
    const veg = (o, word) => [o.raw.rp, o.detrended.rp,
      `${ordR(o.raw.rank)} ${word} · ${since(o.raw)}`];
    const rows = [
      ["Rainfall, July–September", "CHIRPS", (sc) => { const o = D.rain.scopes[sc].jas;
        return [o.rp, null, `${nth(o.rank, "driest")} of ${o.n} · ${o.pct}% of average`]; }, true],
      ["Rainfall, June–October", "CHIRPS; October preliminary", (sc) => { const o = D.rain.scopes[sc].jjaso;
        return [o.rp, null, `${nth(o.rank, "driest")} · ${o.pct}% of average`]; }, true],
      ["Biomass, 1 April – 30 September", "GeoSahel (DMP)", (sc) => { const o = D.biomass.scopes[sc];
        const v = veg(o, "lowest"); v[2] = `${o.raw.pct}% of average · ${v[2]}`; return v; }],
      ["Crop stress (ASI), 1 October", "FAO ASIS, % of cropland", (sc) => { const o = CR.asi.scopes[sc];
        return subFloor(o) ? [null, null, `${o.value.toFixed(1)}% of cropland stressed`, `none (under ${CR.asi.floor}%)`]
          : [o.rp, null, `${o.value.toFixed(1)}% of cropland stressed · ${nth(o.rank, "highest")}`]; }],
      ["Rangeland vegetation", "JRC ASAP zFPARc", (sc) => veg(ZF.scopes[sc], "lowest")],
      ["Surface water, October", "GeoSahel; record from 2020", (sc) => { const o = WA.scopes[sc];
        return [null, null, `${nth(o.rank, "lowest")} of ${o.n} Octobers · ${o.pct_2021}% of 2021–25`,
          `${o.pct}% of 2020–25`]; }],
      ["Temperature, July–September", "ECMWF via JRC ASAP", (sc) => { const o = D.temp.scopes[sc].detrended;
        return [o.rp, null, `${nth(o.rank, "hottest")} · ${sgn(o.value, 1)} °C vs trend`]; }],
    ];
    let h = `<thead><tr><th>Indicator</th><th>National</th><th>Southern belt</th><th>Guidimakha</th></tr></thead><tbody>`;
    for (const [name, src, f, nat] of rows) {
      h += `<tr><td><b>${name}</b><span class="det">${src}</span></td>`;
      for (const sc of ["national", "south", "guidimakha"]) {
        if (sc === "national" && !nat) { h += `<td class="na">–</td>`; continue; }
        const [rp, rpT, d, alt] = f(sc);
        const main = alt ? `<span class="rp">${alt}</span>` : rpSpan(rp);
        const second = rpT != null ? ` <span class="det2">vs trend ${rpSpan(rpT, true)}</span>` : "";
        h += `<td>${main}${second}<span class="det">${d}</span></td>`;
      }
      h += "</tr>";
    }
    d3.select("#sumTable").html(h + "</tbody>");
    const nat = D.rain.scopes.national.jas, so = D.rain.scopes.south.jas;
    d3.select("#longNote").text(`On CHIRPS's full record (1981–2026) July–September 2026 ranks ${ordR(nat.rank_long)} of
      ${nat.n_long} nationally (${fmtRP(nat.rp_long)}) and ${ordR(so.rank_long)} in the southern belt (${fmtRP(so.rp_long)}):
      the 1980s and early 1990s were drier.`);
    d3.select("#waterNote").text(`Southern-belt surface water is for ${WA.six.length} wilayas: ${WA.six.map((c) => D.names1[c]).join(", ")}.
      Trarza and Gorgol are left out because most of their open water is the Senegal River valley and its lakes
      (with them: ${WA.scopes.south_all.pct}% of 2020–25).`);
    const leg = SC.map((c, i) => `<span>${chip(c)}${SCL[i]}</span>`).join("");
    d3.select("#rpLegend").html(`<span><b>Return period</b></span>${leg}`);
    d3.selectAll(".rpleg").html(`<span>Return period:</span>${leg}<span>${chip(NA_FILL)}not assessed</span>
      <span><span class="chip" style="background:#fff;border:2px solid #1f2324"></span>Guidimakha</span>`);
    d3.selectAll(".barleg").html(`<span>${chip(ACC)}${Y}</span><span>${chip(BADC)}framework bad year</span>
      <span>${chip(OTH)}other year</span>`);
  }

  // ---------------------------------------------------------------- rank grid
  function heat() {
    const keys = IND(), cw = 31, ch = 30, lw = 158, top = 40;
    const W = lw + cw * YEARS.length + 6, H = top + ch * keys.length + 4;
    d3.select("#heatTitle").text(`${SCOPE_NAME[scope]}: rank of every season since ${YEARS[0]} (vegetation ${baseWord()})`);
    const el = d3.select("#heat").html(""), svg = el.append("svg").attr("viewBox", `0 0 ${W} ${H}`)
      .attr("role", "img").attr("aria-label", "Rank of each season by indicator");
    YEARS.forEach((y, j) => {
      const x = lw + j * cw + cw / 2;
      svg.append("text").attr("x", x).attr("y", 14).attr("text-anchor", "middle").attr("font-size", 10.5)
        .attr("fill", y === Y ? "#1f2324" : "#5e6a6b").attr("font-weight", y === Y ? 700 : 400).text("’" + String(y).slice(2));
      if (BAD.has(y)) svg.append("text").attr("x", x).attr("y", 30).attr("text-anchor", "middle")
        .attr("font-size", 10).attr("fill", "#5e6a6b").text("▲");
    });
    keys.forEach((ind, i) => {
      const yy = top + i * ch, rk = D.ranks[scope][ind.k], vals = ind.s(scope);
      svg.append("text").attr("x", lw - 8).attr("y", yy + ch / 2 + 4).attr("text-anchor", "end")
        .attr("font-size", 12.5).attr("fill", "#1f2324").text(ind.name);
      YEARS.forEach((y, j) => {
        const v = rk[y]; if (!v) return;
        const [r, rp] = v, x = lw + j * cw;
        const g = svg.append("g");
        g.append("rect").attr("x", x + 1).attr("y", yy + 1).attr("width", cw - 2).attr("height", ch - 2)
          .attr("rx", 3).attr("fill", SC[cls(rp)]);
        g.append("text").attr("x", x + cw / 2).attr("y", yy + ch / 2 + 4).attr("text-anchor", "middle")
          .attr("font-size", 11).attr("fill", cls(rp) >= 3 ? "#fff" : "#1f2324")
          .text(Number.isInteger(r) ? r : Math.floor(r) + "=");
        g.on("mousemove", (ev) => showTip(ev, `<b>${y}${BAD.has(y) ? " · framework bad year" : ""}</b><br>${ind.name}:
            ${nth(r, ind.worst)} of ${YEARS.length}<br>Return period ${fmtRP(rp)}<br>${vals[y] == null ? "" : ind.fmt(+vals[y])}`))
          .on("mouseleave", hideTip);
      });
    });
    const j = YEARS.indexOf(Y);
    svg.append("rect").attr("x", lw + j * cw).attr("y", top - 1).attr("width", cw).attr("height", ch * keys.length + 2)
      .attr("fill", "none").attr("stroke", "#1f2324").attr("stroke-width", 2).attr("rx", 4);
  }

  // ---------------------------------------------------------------- year bars
  function yearBars(sel, rows, o) {
    // rows: [{y, v}]; o: {base, ref, refLabel, fmt, axisFmt, rankKey, worst, colorBad, allTicks, width, height, extra, missingNote}
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
    const col = (d) => (d.y === Y ? ACC : o.colorBad !== false && BAD.has(d.y) ? BADC : OTH);
    svg.append("g").selectAll("path").data(data).join("path")
      .attr("d", (d) => { // bar with a 2px rounded data end, square at the baseline
        const x0 = x(d.y), w = x.bandwidth(), yb = y(o.base), yv = y(d.v), up = yv < yb, r = Math.min(2, Math.abs(yb - yv));
        return up ? `M${x0},${yb}V${yv + r}Q${x0},${yv} ${x0 + r},${yv}H${x0 + w - r}Q${x0 + w},${yv} ${x0 + w},${yv + r}V${yb}Z`
                  : `M${x0},${yb}V${yv - r}Q${x0},${yv} ${x0 + r},${yv}H${x0 + w - r}Q${x0 + w},${yv} ${x0 + w},${yv - r}V${yb}Z`;
      })
      .attr("fill", col);
    if (o.ref != null && o.ref !== o.base) {
      svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(o.ref)).attr("y2", y(o.ref))
        .attr("stroke", "#5e6a6b").attr("stroke-dasharray", "4 3");
      svg.append("text").attr("x", m.l + 4).attr("y", y(o.ref) - 4).attr("text-anchor", "start").attr("font-size", 10.5)
        .attr("fill", "#5e6a6b").attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 3)
        .text(o.refLabel || "average");
    }
    const d26 = data.find((d) => d.y === Y); // direct label on the highlighted bar only
    if (d26 && o.short) {
      const up = d26.v >= o.base;
      svg.append("text").attr("x", x(Y) + x.bandwidth() / 2).attr("y", y(d26.v) + (up ? -5 : 13))
        .attr("text-anchor", "end").attr("dx", x.bandwidth() / 2).attr("font-size", 11).attr("font-weight", 700)
        .attr("fill", "#1f2324").attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 3)
        .text(o.short(d26.v));
    }
    svg.append("g").selectAll("rect").data(data).join("rect")
      .attr("x", (d) => x(d.y) - x.step() * x.padding() / 2).attr("width", x.step()).attr("y", m.t).attr("height", H - m.b - m.t)
      .attr("fill", "transparent")
      .on("mousemove", (ev, d) => {
        const rk = o.rankKey ? D.ranks[scope][o.rankKey][d.y] : null;
        showTip(ev, `<b>${d.y}${BAD.has(d.y) && o.colorBad !== false ? " · framework bad year" : ""}</b><br>${o.fmt(d.v)}` +
          (rk ? `<br>${nth(rk[0], o.worst)} of ${YEARS.length} · ${fmtRP(rk[1])}` : "") +
          (o.extra ? o.extra(d.y) : ""));
      }).on("mouseleave", hideTip);
  }

  function bars() {
    const sc = scope, nm = SCOPE_NAME[sc], past = YEARS.filter((y) => y < Y);
    // rain
    const rs = D.rain.scopes[sc].series_jas, rref = mean(past.map((y) => rs[y]));
    d3.select("#barsRainHead").text(`${nm}: July–September rainfall by season (mm)`);
    yearBars("#barsRain", ser(rs), { base: 0, ref: rref, refLabel: "2001–2025 average", rankKey: "rain", worst: "driest", short: (v) => v.toFixed(0) + " mm",
      fmt: (v) => `${v.toFixed(0)} mm (${Math.round(100 * v / rref)}% of average)`, axisFmt: (v) => v, width: 940, height: 190 });
    // biomass
    const b = D.biomass.scopes[sc];
    if (isTrend()) {
      d3.select("#barsBioHead").text(`${nm}: biomass to 30 September, % of trend`);
      yearBars("#barsBio", ser(b.series_ratio, (v) => v * 100), { base: 100, rankKey: "biomass_trend", worst: "lowest", short: (v) => Math.round(v) + "%",
        fmt: (v) => `${Math.round(v)}% of trend`, axisFmt: (v) => v + "%",
        extra: (yy) => `<br>${Math.round(b.series_pct[yy])}% of the 2001–2025 average` });
    } else {
      d3.select("#barsBioHead").text(`${nm}: biomass to 30 September, % of the 2001–2025 average`);
      yearBars("#barsBio", ser(b.series_pct), { base: 100, rankKey: "biomass", worst: "lowest", short: (v) => Math.round(v) + "%",
        fmt: (v) => `${Math.round(v)}% of average`, axisFmt: (v) => v + "%",
        extra: (yy) => `<br>${Math.round(100 * b.series_ratio[yy])}% of trend` });
    }
    d3.select("#bioCap").text(`${Y}: ${b.raw.pct}% of the 2001–2025 average (${nth(b.raw.rank, "lowest")}, ${fmtRP(b.raw.rp)}),
      ${Math.round(b.detrended.value * 100)}% of the linear trend (${nth(b.detrended.rank, "lowest")}, ${fmtRP(b.detrended.rp)}).
      The greening is mostly a step up since 2020 rather than a steady trend.`);
    // crop stress (ASI)
    const a = CR.asi.scopes[sc];
    d3.select("#barsAsiHead").text(`${nm}: crop stress at 1 October (FAO ASI, % of cropland)`);
    yearBars("#barsAsi", ser(a.series), { base: 0, rankKey: "asi", worst: "highest", short: (v) => v.toFixed(1) + "%",
      fmt: (x) => `${x.toFixed(1)}% of cropland stressed`, axisFmt: (x) => x + "%", width: 940, height: 170 });
    // VHI (secondary)
    const v = CR.vhi.scopes[sc], vs = isTrend() ? v.series : v.series_raw;
    const vref = mean(past.map((y) => v.series_raw[y]));
    d3.select("#barsVhiHead").text(`${nm}: cropland vegetation health (VHI), season mean${isTrend() ? ", trend-adjusted" : ""}`);
    yearBars("#barsVhi", ser(vs), { base: vref, worst: "lowest", short: (v) => v.toFixed(2),
      fmt: (x) => `VHI ${x.toFixed(2)}${isTrend() ? " (trend-adjusted)" : ""}`, axisFmt: (x) => x.toFixed(2) });
    d3.select("#vhiCap").text(`Bars from the 2001–2025 average; VHI runs from 0 (poor) to 1 (good). ${Y}:
      ${nth(v.raw.rank, "lowest")} (${fmtRP(v.raw.rp)}), ${since(v.raw)}; against trend ${ordR(v.detrended.rank)}
      (${fmtRP(v.detrended.rp)}).`);
    // rangeland
    const z = ZF.scopes[sc], zs = isTrend() ? z.series : z.series_raw, zref = mean(past.map((y) => z.series_raw[y]));
    d3.select("#barsZHead").text(`${nm}: rangeland vegetation to ${zDate()} (ASAP zFPARc)${isTrend() ? ", trend-adjusted" : ""}`);
    yearBars("#barsZ", ser(zs), { base: zref, rankKey: isTrend() ? "zfparc_trend" : "zfparc", worst: "lowest", short: (v) => sgn(v, 2),
      fmt: (x) => `z ${sgn(x, 2)}${isTrend() ? " (trend-adjusted)" : ""}`, axisFmt: (x) => x.toFixed(1) });
    d3.select("#zCap").text(`Cumulative rangeland vegetation since the start of the season, as a z-score. ${Y}: ASAP's
      z ${sgn(z.raw.value, 2)}, ${nth(z.raw.rank, "lowest")} (${fmtRP(z.raw.rp)}), ${since(z.raw)}; against trend
      ${ordR(z.detrended.rank)} (${fmtRP(z.detrended.rp)}).`);
    // water
    const w = WA.scopes[sc], wref = mean(WA.ref.map((y) => w.series[y]));
    d3.select("#barsWHead").text(`${nm === "Southern belt" ? `${WA.six.length} pastoral wilayas` : nm}: surface water in October (km²)`);
    yearBars("#barsW", WA.years.map((y) => ({ y, v: w.series[y] })), { base: 0, ref: wref, refLabel: "2020–2025 average",
      colorBad: false, allTicks: true, short: (v) => v.toFixed(sc === "south" ? 0 : 1), fmt: (x) => `${x.toFixed(sc === "south" ? 0 : 1)} km²`, axisFmt: (x) => x, height: 190 });
    // temperature
    const t = D.temp.scopes[sc];
    d3.select("#barsTHead").text(`${nm}: July–September temperature, °C above or below trend`);
    yearBars("#barsT", ser(t.series_anom), { base: 0, rankKey: "temp", worst: "hottest", short: (v) => sgn(v, 1) + " °C", fmt: (x) => `${sgn(x, 2)} °C vs trend`,
      axisFmt: (x) => sgn(x, 1) });
    d3.select("#tCap").text(`Trend +${t.trend_c_per_decade.toFixed(2)} °C per decade (1989–2025). Without removing it, ${Y}
      is ${sgn(t.raw.anom, 1)} °C above the 2001–2025 average, ${nth(t.raw.rank, "hottest")}.`);
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
    const ends = [[c26[n - 1], String(Y), ACC], [env[n - 1].mu, "average", "#5e6a6b"], [C[driest][n - 1], String(driest), "#3f4748"]]
      .sort((a, b) => b[0] - a[0]);
    let prev = -1e9; // nudge end labels apart
    ends.forEach(([v, t, c]) => { let py = y(v); if (py - prev < 13) py = prev + 13; prev = py;
      svg.append("text").attr("x", W - m.r + 5).attr("y", py + 4).attr("font-size", 11).attr("fill", c)
        .attr("font-weight", c === ACC ? 700 : 400).text(t); });
    let th = null;
    if (sc === "national") {
      th = D.rain.window2.thresholds.map((t, k) => ({ i: k + 1, t }));
      svg.append("g").selectAll("path").data(th).join("path")
        .attr("transform", (d) => `translate(${x(d.i)},${y(d.t)})`).attr("d", d3.symbol(d3.symbolDiamond, 46))
        .attr("fill", "#1f2324").attr("stroke", "#fff").attr("stroke-width", 1.5);
    }
    const hl = svg.append("line").attr("y1", m.t).attr("y2", H - m.b).attr("stroke", "#7e8e8f").style("display", "none");
    const dot = svg.append("circle").attr("r", 4.5).attr("fill", ACC).attr("stroke", "#fff").attr("stroke-width", 2).style("display", "none");
    svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b)
      .attr("fill", "transparent")
      .on("mousemove", (ev) => {
        const [mx] = d3.pointer(ev), i = Math.max(0, Math.min(n - 1, Math.round(x.invert(mx))));
        hl.attr("x1", x(i)).attr("x2", x(i)).style("display", null);
        dot.attr("cx", x(i)).attr("cy", y(c26[i])).style("display", null);
        const t = th && th.find((d) => d.i === i);
        showTip(ev, `<b>Rain from 1 July to the end of the dekad starting ${DK[i]}</b>${i > lastFinal ? " (preliminary)" : ""}<br>
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
      : `${SCOPE_NAME[sc]}: July–September ${jr.pct}% of the 2001–2025 average, ${nth(jr.rank, "driest")} since 2001.`);
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
    southGeo.features.forEach((f) => {
      const [[x0, y0], [x1, y1]] = path.bounds(f), [cx, cy] = path.centroid(f);
      if (x1 - x0 < 34 || y1 - y0 < 18) return;
      svg.append("text").attr("x", cx).attr("y", cy).attr("text-anchor", "middle").attr("font-size", 9.5)
        .attr("fill", "#1f2324").attr("paint-order", "stroke").attr("stroke", "rgba(255,255,255,.85)").attr("stroke-width", 2.5)
        .style("pointer-events", "none").text(D.names1[f.properties.code].replace("Hodh ", "H. "));
    });
  }
  const rpFill = (o) => (o && o.rp != null ? SC[cls(o.rp)] : null);

  function staticMaps() {
    map("#mapRain", { level: 1, fit: "all", aria: "July to September rainfall return period by wilaya",
      val: (c) => { const o = D.rain.units[c]; if (!o || o.rp == null) return null;
        return { fill: rpFill(o), tip: `Jul–Sep ${o.value.toFixed(0)} mm, ${o.pct}% of average<br>${nth(o.rank, "driest")} since 2001 · ${fmtRP(o.rp)}` +
          (o.mean < 60 ? "<br><i>Arid: average under 60 mm</i>" : "") }; } });
    map("#mapAsi", { level: 1, fit: "south", aria: "Crop stress return period by wilaya",
      val: (c) => { const o = CR.asi.adm1[c]; if (!o) return null;
        if (subFloor(o)) return { fill: SC[0], tip: `${o.value.toFixed(1)}% of cropland stressed at 1 October: none (under ${CR.asi.floor}%)
          <br>${CR.weights[c]}% of the belt's cropland` };
        return { fill: rpFill(o), tip: `${o.value.toFixed(1)}% of cropland stressed at 1 October<br>${nth(o.rank, "highest")} · ${fmtRP(o.rp)}
          <br>${CR.weights[c]}% of the belt's cropland` }; } });
    map("#mapT", { level: 1, fit: "south", aria: "Temperature return period by wilaya",
      val: (c) => { const o = D.temp.adm1[c]; if (!o) return null; const d = o.detrended;
        return { fill: rpFill(d), tip: `${sgn(d.value, 2)} °C vs trend<br>${nth(d.rank, "hottest")} · ${fmtRP(d.rp)}` }; } });
    const WC = ["#73300c", "#b04f14", "#d9762f", "#eb9f63", "#e2e8e8"], WL = ["under 50%", "50–65%", "65–80%", "80–100%", "100% or more"];
    const wcls = (p) => (p < 50 ? 0 : p < 65 ? 1 : p < 80 ? 2 : p < 100 ? 3 : 4);
    map("#mapW", { level: 2, fit: "south", aria: "October 2026 surface water by moughataa",
      val: (c) => { const o = WA.adm2[c]; if (!o) return null;
        return { fill: WC[wcls(o.pct)], tip: `${o.pct}% of the 2020–25 October average<br>${nth(o.rank, "lowest")} of ${o.n} Octobers` }; } });
    d3.select("#wLegend").html(WL.map((l, i) => `<span>${chip(WC[i])}${l}</span>`).join("") +
      `<span>${chip(NA_FILL)}little or no open water / not assessed</span>`);
  }

  function vegMaps() {
    const tr = isTrend();
    d3.select("#mapBioHead").text(`Biomass ${tr ? "against trend" : "against the 2001–2025 average"}, return period by moughataa`);
    map("#mapBio", { level: 2, fit: "south", aria: "Biomass return period by moughataa",
      val: (c) => { const o = D.biomass.adm2[c];
        if (!o) return D.biomass.adm2_arid.includes(c) ? { fill: NA_FILL, tip: "Arid: too little biomass to rank" } : null;
        const txt = `${o.raw.pct}% of average · ${Math.round(o.detrended.value * 100)}% of trend (trend ${sgn(o.trend_pct_per_decade, 0)}% per decade)`;
        if (tr && o.steep) return { fill: NA_FILL, tip: `${txt}<br>Trend too steep to adjust; against the average ${nth(o.raw.rank, "lowest")} · ${fmtRP(o.raw.rp)}` };
        const d = tr ? o.detrended : o.raw;
        return { fill: rpFill(d), tip: `${txt}<br>${nth(d.rank, "lowest")} ${tr ? "vs trend" : "vs average"} · ${fmtRP(d.rp)}` }; } });
    d3.select("#mapZHead").text(`Rangeland vegetation ${tr ? "against trend" : "against the 2001–2025 average"}, return period by wilaya`);
    map("#mapZ", { level: 1, fit: "south", aria: "Rangeland vegetation return period by wilaya",
      val: (c) => { const o = ZF.adm1[c]; if (!o) return null; const d = tr ? o.detrended : o.raw;
        return { fill: rpFill(d), tip: `ASAP z ${sgn(o.raw.value, 2)}<br>${nth(d.rank, "lowest")} ${tr ? "vs trend" : "vs average"} · ${fmtRP(d.rp)}` }; } });
  }

  // ---------------------------------------------------------------- sources + method numbers
  function sources() {
    const li = [
      `<b>CHIRPS rainfall</b> by wilaya: WFP, <a href="https://data.humdata.org/dataset/mrt-rainfall-subnational">HDX</a>; final to the dekad of ${D.rain.last_final}, preliminary to ${D.rain.last}.`,
      `<b>Biomass</b> and <b>surface water</b>: <a href="https://geosahel.info">GeoSahel</a> (Action contre la Faim; Copernicus DMP), biomass to dekad ${D.biomass.last_dekad} of ${Y}, water to October ${Y}.`,
      `<b>ASI and vegetation health</b>: <a href="https://www.fao.org/giews/earthobservation/country/index.jsp?code=MRT&lang=en">FAO GIEWS ASIS</a>, dekadal ASI and VHI to ${CR.last}; annual ASI to ${CR.asi.annual_last_year}.`,
      `<b>Rangeland vegetation and temperature</b>: <a href="https://agricultural-production-hotspots.ec.europa.eu">JRC ASAP</a> indicator statistics (zFPARc on rangeland; ECMWF temperature).`,
      `<b>Bad years</b> and Window 2 thresholds: <a href="https://reliefweb.int/report/mauritania/cadre-de-laction-anticipatoire-secheresse-en-mauritanie-17-avril-2026">Mauritania drought AA framework, 17 April 2026</a> (Annex 1).`,
      `<b>Boundaries</b>: COD-AB Mauritania v03, <a href="https://data.humdata.org/dataset/cod-ab-mrt">HDX</a>.`,
    ];
    d3.select("#srcList").html(li.map((x) => `<li>${x}</li>`).join(""));
    d3.select("#asiR").text(`${CR.asi.r_national.toFixed(3)} against FAO's national annual ASI (${CR.asi.r_national_no2002.toFixed(3)} without 2002;
      typical difference ${CR.asi.rmse_national.toFixed(1)} points) and ${CR.asi.r_guidimakha.toFixed(3)} in Guidimakha, 2001–2025`);
    d3.select("#asiW").text(D.south.map((c) => `${D.names1[c]} ${CR.weights[c]}%`).join(", "));
    const miss = Object.entries(CR.vhi.missing).filter(([, v]) => v.length).map(([c, v]) => `${D.names1[c]} ${v.join(", ")}`);
    d3.select("#vhiMiss").text(miss.length ? `Missing dekads drop ${miss.join("; ")} from the VHI series; the belt mean re-weights the others.` : "");
    d3.select("#zDekad").text(zDate());
    const ec = Object.entries(D.rain.ecmwf_check);
    d3.select("#ecmwf").text(ec.map(([c, o]) => `${D.names1[c]} ${o.ecmwf_pct}% vs ${o.chirps_pct}%`).join(", "));
    const rr = ec.map(([, o]) => o.r);
    d3.selectAll(".ecmwfR").text(`${Math.min(...rr).toFixed(2)}–${Math.max(...rr).toFixed(2)}`);
    d3.select("#steepList").text(Object.entries(D.biomass.adm2).filter(([, o]) => o.steep).map(([c]) => D.names2[c]).join(", "));
    d3.select("#aridList").text(D.biomass.adm2_arid.map((c) => D.names2[c]).join(", "));
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
  seg("baseSeg", (v) => { base = v; heat(); bars(); vegMaps(); });
  seg("curveSeg", (v) => { curveScope = v; curve(); });

  lead(); summary(); heat(); curve(); bars(); staticMaps(); vegMaps(); sources();
  // the page is drawn after the data loads, so jump to a #section link only now
  if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
})();
